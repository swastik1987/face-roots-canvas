/**
 * /capture — Front-only guided capture.
 *
 * State machine:
 *   loading → detecting_front → captured_front → uploading → done
 *
 * Advance rules:
 *   |yaw| < 8° && |pitch| < 8° stable ≥ 1.2 s
 *   Face bbox ≥ 18% of frame area
 *
 * On capture: crops the face to an oval-aligned 768×1024 JPEG via canvas,
 * so the stored portrait is already framed for thumbnails and feature crops.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { initDetector, setRunningMode, detectVideoFrame, isDetectorReady } from "@/lib/face/detector";
import { extractPose } from "@/lib/face/pose";
import { cropAndUploadFeatures, loadImageFromBlob } from "@/lib/face/uploadCrops";
import { useFaceStore } from "@/stores/faceStore";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { captureEvent } from "@/lib/analytics";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

// ── Types & constants ─────────────────────────────────────────────────────────

type Step = "loading" | "detecting_front" | "captured_front" | "uploading" | "done" | "error";

const STABLE_MS = 1200;
const MIN_FACE_RATIO = 0.11;
const MAX_FACE_RATIO = 0.32;
const YAW_MAX = 8;
const PITCH_MAX = 8;

// Oval region in normalized video coords (matches SVG oval centered, ~0.55w × 0.78h)
const OVAL_NORM = { cx: 0.5, cy: 0.5, rx: 0.275, ry: 0.39 };

function bboxInsideOval(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const corners = [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ];
  for (const [x, y] of corners) {
    const dx = (x - OVAL_NORM.cx) / OVAL_NORM.rx;
    const dy = (y - OVAL_NORM.cy) / OVAL_NORM.ry;
    if (dx * dx + dy * dy > 1) return false;
  }
  return true;
}

// Output canvas dimensions (matches oval portrait aspect ≈ 3:4)
const OUTPUT_W = 768;
const OUTPUT_H = 1024;
// Oval aspect (ry/rx) — keep in sync with OvalOverlay
const OVAL_ASPECT = 1.36;

// ── Component ─────────────────────────────────────────────────────────────────

const Capture = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const webcamRef = useRef<Webcam>(null);
  const rafRef = useRef<number>(0);
  const stableStartRef = useRef<number | null>(null);

  const { addFrame, clearFrames, frames } = useFaceStore();

  const [step, setStep] = useState<Step>("loading");
  const [hasFace, setHasFace] = useState(false);
  const [stableProgress, setStableProgress] = useState(0);
  const [cameraError, setCameraError] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showFlash, setShowFlash] = useState(false);
  const [alignmentHint, setAlignmentHint] = useState<string | null>(null);

  // ── Detector init ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    initDetector()
      .then(() => setRunningMode("VIDEO"))
      .then(() => {
        if (!cancelled) {
          setStep("detecting_front");
          captureEvent("capture_started");
        }
      })
      .catch((err) => {
        console.error("[FaceBlame] FaceLandmarker init failed", err);
        if (!cancelled) setStep("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Detection loop ─────────────────────────────────────────────────────────

  const runDetection = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState < 2 || !isDetectorReady()) {
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    if (step !== "detecting_front") return;

    let result: FaceLandmarkerResult;
    try {
      result = detectVideoFrame(video, performance.now());
    } catch {
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const facesFound = (result.faceLandmarks?.length ?? 0) > 0;

    if (!facesFound) {
      setHasFace(false);
      setAlignmentHint("No face detected");
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const lms = result.faceLandmarks[0];
    const xs = lms.map((l) => l.x),
      ys = lms.map((l) => l.y);
    const minNX = Math.min(...xs), maxNX = Math.max(...xs);
    const minNY = Math.min(...ys), maxNY = Math.max(...ys);
    const faceArea = (maxNX - minNX) * (maxNY - minNY);

    if (faceArea > MAX_FACE_RATIO) {
      setHasFace(false);
      setAlignmentHint("Move back a little");
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    if (faceArea < MIN_FACE_RATIO) {
      setHasFace(false);
      setAlignmentHint("Move closer");
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    if (!bboxInsideOval(minNX, minNY, maxNX, maxNY)) {
      setHasFace(true);
      setAlignmentHint("Fit your whole face in the oval");
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    setHasFace(true);

    const pose = extractPose(result);
    if (!pose) {
      setAlignmentHint(null);
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const yawOk = Math.abs(pose.yaw) < YAW_MAX;
    const pitchOk = Math.abs(pose.pitch) < PITCH_MAX;

    if (yawOk && pitchOk) {
      setAlignmentHint(null);
      const now = performance.now();
      if (!stableStartRef.current) stableStartRef.current = now;
      const elapsed = now - stableStartRef.current;
      setStableProgress(Math.min(elapsed / STABLE_MS, 1));

      if (elapsed >= STABLE_MS) {
        stableStartRef.current = null;
        setStableProgress(0);
        captureFrame(result);
        return;
      }
    } else {
      // Pick the worst axis to coach the user one nudge at a time.
      // Note: video is mirrored — positive yaw means the user's head is
      // turned to *their* left, which appears on the right side of the screen.
      const yawErr = Math.abs(pose.yaw) - YAW_MAX;
      const pitchErr = Math.abs(pose.pitch) - PITCH_MAX;
      let hint: string;
      if (yawErr >= pitchErr) {
        hint = pose.yaw > 0 ? "Turn slightly right" : "Turn slightly left";
      } else {
        hint = pose.pitch > 0 ? "Tilt down" : "Tilt up";
      }
      setAlignmentHint(hint);
      stableStartRef.current = null;
      setStableProgress(0);
    }

    rafRef.current = requestAnimationFrame(runDetection);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step === "detecting_front") rafRef.current = requestAnimationFrame(runDetection);
    return () => cancelAnimationFrame(rafRef.current);
  }, [step, runDetection]);

  // ── Capture: crop face to oval-aligned canvas ──────────────────────────────

  const captureFrame = (landmarkResult: FaceLandmarkerResult) => {
    const video = webcamRef.current?.video;
    if (!video) return;
    const lms = landmarkResult.faceLandmarks?.[0];
    if (!lms) return;

    navigator.vibrate?.(30);
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 400);

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Face bbox in source pixels
    const xs = lms.map((l) => l.x * vw);
    const ys = lms.map((l) => l.y * vh);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const fw = maxX - minX;
    const fh = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Expand to oval aspect (rx, ry where ry/rx = OVAL_ASPECT) + 15% pad
    const pad = 1.15;
    let cropH = fh * OVAL_ASPECT * pad;
    let cropW = cropH / OVAL_ASPECT;
    if (cropW < fw * pad) {
      cropW = fw * pad;
      cropH = cropW * OVAL_ASPECT;
    }

    // Clamp to source bounds
    let sx = cx - cropW / 2;
    let sy = cy - cropH / 2;
    if (sx < 0) sx = 0;
    if (sy < 0) sy = 0;
    if (sx + cropW > vw) sx = vw - cropW;
    if (sy + cropH > vh) sy = vh - cropH;
    if (sx < 0) {
      sx = 0;
      cropW = vw;
    }
    if (sy < 0) {
      sy = 0;
      cropH = vh;
    }

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror to match selfie-mirrored preview
    ctx.translate(OUTPUT_W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, OUTPUT_W, OUTPUT_H);

    // Normalized bbox of the face within the cropped output (0..1)
    // Account for the horizontal mirror (1 - x)
    const bbox = {
      x: 1 - (cx - sx + fw / 2) / cropW,
      y: (cy - sy - fh / 2) / cropH,
      w: fw / cropW,
      h: fh / cropH,
    };

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        addFrame({
          angle: "front",
          imageDataUrl: URL.createObjectURL(blob),
          blob,
          landmarkResult,
          blurScore: 0,
          faceConfidence: 1,
          // @ts-expect-error — added at runtime; bbox stored alongside frame
          bbox,
        });
        setStep("captured_front");
      },
      "image/jpeg",
      0.92,
    );
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (step === "uploading") uploadAllFrames();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadAllFrames = async () => {
    if (!user) return;
    setUploadError("");
    try {
      let { data: selfPerson } = await supabase
        .from("persons")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("is_self", true)
        .maybeSingle();

      if (!selfPerson) {
        const { data: np, error: pe } = await supabase
          .from("persons")
          .insert({
            owner_user_id: user.id,
            display_name: "Me",
            relationship_tag: "self",
            generation: 0,
            is_self: true,
          })
          .select("id")
          .single();
        if (pe) throw pe;
        selfPerson = np;
      }

      for (const frame of Object.values(frames)) {
        if (!frame) continue;
        const path = `${user.id}/self/${frame.angle}_${Date.now()}.jpg`;

        const { error: se } = await supabase.storage
          .from("face-images-raw")
          .upload(path, frame.blob, { contentType: "image/jpeg" });
        if (se) throw se;

        const { data: imgRow, error: ie } = await supabase
          .from("face_images")
          .insert({
            person_id: selfPerson.id,
            storage_path: path,
            angle: frame.angle,
            capture_method: "guided_capture",
            face_confidence: frame.faceConfidence,
          })
          .select("id")
          .single();
        if (ie) throw ie;

        const lms = frame.landmarkResult;
        const matrices = lms.facialTransformationMatrixes;
        const matrixArr = matrices?.[0]?.data ? Array.from(matrices[0].data) : null;
        // bbox is attached to the frame at capture time
        const bbox = (frame as unknown as { bbox?: { x: number; y: number; w: number; h: number } }).bbox ?? null;
        await supabase.from("face_landmarks").insert({
          face_image_id: imgRow.id,
          landmarks_json: {
            landmarks: lms.faceLandmarks?.[0] ?? [],
            matrix: matrixArr,
            bbox,
          },
        });

        // Crop features client-side from the already-oval-cropped portrait.
        try {
          const sourceImg = await loadImageFromBlob(frame.blob);
          await cropAndUploadFeatures(selfPerson.id, imgRow.id, sourceImg, frame.landmarkResult, frame.angle);
        } catch (cropErr) {
          console.warn("[Capture] Feature crop upload failed:", cropErr);
        }
      }

      clearFrames();
      captureEvent("capture_done");
      await queryClient.invalidateQueries({ queryKey: ["persons", user.id] });
      setStep("done");
    } catch (err) {
      console.error("[FaceBlame] Upload failed", err);
      setUploadError("Upload failed. Tap retry.");
      setStep("error");
    }
  };

  const retry = () => {
    clearFrames();
    setStep("detecting_front");
  };

  // ── Done ───────────────────────────────────────────────────────────────────

  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <CheckCircle2 size={72} className="text-cyan" />
        </motion.div>
        <h1 className="text-2xl font-bold">All done!</h1>
        <p className="text-muted-foreground text-center text-sm">Your photo is saved. Add family members next.</p>
        <button className="btn-gradient px-8 py-3" onClick={() => navigate("/home")}>
          Back to home
        </button>
      </div>
    );
  }

  const isCapturedStep = step === "captured_front";

  const showLiveCamera = step === "detecting_front" || step === "loading";

  return (
    <div className="relative flex flex-col min-h-screen bg-black overflow-hidden">
      {/* Camera feed — only during live detection */}
      {!cameraError && showLiveCamera && (
        <Webcam
          ref={webcamRef}
          audio={false}
          videoConstraints={{
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            aspectRatio: 16 / 9,
          }}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.92}
          className="absolute inset-0 w-full h-full object-contain bg-black"
          onUserMediaError={() => setCameraError(true)}
          mirrored
        />
      )}

      {/* Gradient overlays */}
      {showLiveCamera && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70 pointer-events-none" />
      )}

      {/* Capture flash */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            className="absolute inset-0 bg-white pointer-events-none z-30"
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Oval overlay — full-height, only during live detection */}
      {showLiveCamera && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6 z-10 pb-8">
          <div
            className="relative"
            style={{ height: "85vh", maxHeight: "calc((100vw - 3rem) * 1.307)", aspectRatio: "260/340" }}
          >
            <OvalOverlay progress={stableProgress} hasFace={hasFace} captured={false} />
            <AnimatePresence mode="wait">
              {step === "detecting_front" && (alignmentHint || hasFace) && (
                <motion.div
                  key={alignmentHint ?? "aligned"}
                  className={`absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-medium rounded-full px-5 py-2 border backdrop-blur-md shadow-lg ${
                    alignmentHint
                      ? "text-amber-300 bg-amber-500/20 border-amber-500/40"
                      : "text-cyan bg-cyan/20 border-cyan/40"
                  }`}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {alignmentHint ?? "Face detected"}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Captured-front review: show preview + Retake / Submit */}
      {isCapturedStep && frames.front?.imageDataUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 z-20 bg-black/70 backdrop-blur-md pb-8">
          <div
            className="relative"
            style={{ height: "75vh", maxHeight: "calc((100vw - 3rem) * 1.307)", aspectRatio: "260/340" }}
          >
            <svg width="100%" height="100%" viewBox="0 0 260 340" preserveAspectRatio="xMidYMid meet">
              <defs>
                <clipPath id="review-oval-clip">
                  <ellipse cx="130" cy="170" rx="110" ry="150" />
                </clipPath>
              </defs>
              <image
                href={frames.front.imageDataUrl}
                x="20"
                y="20"
                width="220"
                height="300"
                clipPath="url(#review-oval-clip)"
                preserveAspectRatio="xMidYMid slice"
              />
              <ellipse cx="130" cy="170" rx="110" ry="150" fill="none" stroke="rgba(0,229,255,0.9)" strokeWidth="2.5" />
            </svg>
          </div>
          <div className="flex gap-3 mt-6 w-full max-w-sm">
            <button
              className="flex-1 px-6 py-3 rounded-full border border-white/30 text-white/90 text-sm font-medium hover:bg-white/5 transition"
              onClick={retry}
            >
              Retake
            </button>
            <button className="flex-1 btn-gradient px-6 py-3 text-sm" onClick={() => setStep("uploading")}>
              Submit
            </button>
          </div>
        </div>
      )}

      {/* Top instruction bar */}
      <div className="absolute top-0 inset-x-0 z-30 pt-10 md:pt-16 px-6 text-center pointer-events-none drop-shadow-xl bg-gradient-to-b from-black/60 to-transparent pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="space-y-1"
          >
            {step === "loading" && (
              <p className="text-white/80 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Loading face detector…
              </p>
            )}
            {step === "detecting_front" && (
              <>
                <p className="text-xs text-white/50 uppercase tracking-widest">Align your face</p>
                <p className="text-white font-semibold text-lg">Look straight at the camera</p>
                <p className="text-white/50 text-sm">Centre your face inside the oval</p>
              </>
            )}
            {isCapturedStep && (
              <>
                <p className="text-xs text-cyan/70 uppercase tracking-widest">Looks good?</p>
                <p className="text-white font-semibold text-lg">Retake or submit to continue</p>
              </>
            )}
            {step === "uploading" && (
              <p className="text-white/80 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Saving your photo…
              </p>
            )}
            {step === "error" && <p className="text-red-400">{uploadError || "Detector failed to load."}</p>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      {stableProgress > 0 && !isCapturedStep && (
        <div className="absolute bottom-28 inset-x-0 px-10 z-10">
          <div className="h-1 rounded-full bg-white/15 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan to-fuchsia-500 rounded-full"
              style={{ width: `${stableProgress * 100}%` }}
            />
          </div>
          <p className="text-center text-xs text-white/40 mt-1">Hold still…</p>
        </div>
      )}

      {/* Camera error */}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 bg-black px-6 text-center">
          <p className="text-white/80">Camera access denied or unavailable.</p>
          <button className="btn-gradient px-6 py-2 text-sm" onClick={() => navigate("/home")}>
            Go back
          </button>
        </div>
      )}

      {/* Retry on error */}
      {step === "error" && (
        <div className="absolute bottom-12 inset-x-0 flex justify-center z-20">
          <button className="flex items-center gap-2 btn-gradient px-6 py-3" onClick={retry}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      )}
    </div>
  );
};

// ── Oval overlay with high-precision alignment grid ──────────────────────────

function OvalOverlay({ progress, hasFace, captured }: { progress: number; hasFace: boolean; captured: boolean }) {
  const circumference = 816;

  const baseStroke = captured ? "rgba(0,229,255,0.9)" : hasFace ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)";

  // Grid line opacity & color — brightens with face presence, cyan when locked
  const gridColor = captured ? "rgba(0,229,255,0.7)" : hasFace ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)";

  // Oval geometry (must match clip mask)
  const cx = 130,
    cy = 170,
    rx = 110,
    ry = 150;

  // Feature alignment lines (relative to oval bounding box)
  const top = cy - ry;
  const left = cx - rx;
  const right = cx + rx;
  const eyeY = top + ry * 2 * 0.33; // ~33% from top
  const noseY = top + ry * 2 * 0.58; // ~58%
  const mouthY = top + ry * 2 * 0.72; // ~72%

  // Feature line color intensity based on lock/face state
  const featureOpacity = captured ? 1 : hasFace ? 0.6 : 0.35;
  const EYE_COLOR = "#22d3ee"; // cyan
  const NOSE_COLOR = "#e879f9"; // fuchsia
  const MOUTH_COLOR = "#fbbf24"; // amber
  const AXIS_COLOR = "rgba(255,255,255,0.4)";
  const THIRDS_COLOR = "rgba(255,255,255,0.15)";

  return (
    <svg width="100%" height="100%" viewBox="0 0 260 340" preserveAspectRatio="xMidYMid meet">
      <defs>
        <mask id="oval-mask">
          <rect width="260" height="340" fill="white" />
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="black" />
        </mask>
        <clipPath id="oval-clip">
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
        </clipPath>
      </defs>

      {/* Dim outside the oval */}
      <rect width="260" height="340" fill="rgba(0,0,0,0.35)" mask="url(#oval-mask)" />

      {/* Inner alignment grid — clipped to oval */}
      <g clipPath="url(#oval-clip)">
        {/* Vertical centre (nose axis) — neutral white */}
        <line x1={cx} y1={top} x2={cx} y2={cy + ry} stroke={AXIS_COLOR} strokeWidth="0.6" strokeDasharray="3 4" />

        {/* Rule-of-thirds vertical thirds — very faint */}
        <line
          x1={left + (rx * 2) / 3}
          y1={top}
          x2={left + (rx * 2) / 3}
          y2={cy + ry}
          stroke={THIRDS_COLOR}
          strokeWidth="0.4"
          strokeDasharray="1 4"
        />
        <line
          x1={left + (rx * 4) / 3}
          y1={top}
          x2={left + (rx * 4) / 3}
          y2={cy + ry}
          stroke={THIRDS_COLOR}
          strokeWidth="0.4"
          strokeDasharray="1 4"
        />

        {/* Eye line — cyan */}
        <g opacity={featureOpacity}>
          <line x1={left} y1={eyeY} x2={right} y2={eyeY} stroke={EYE_COLOR} strokeWidth="1" strokeDasharray="4 3" />
          <circle cx={right - 3} cy={eyeY} r="2" fill={EYE_COLOR} />
        </g>

        {/* Nose-tip line — fuchsia (shorter) */}
        <g opacity={featureOpacity}>
          <line
            x1={cx - rx * 0.4}
            y1={noseY}
            x2={cx + rx * 0.4}
            y2={noseY}
            stroke={NOSE_COLOR}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <circle cx={cx + rx * 0.4} cy={noseY} r="2" fill={NOSE_COLOR} />
        </g>

        {/* Mouth line — amber */}
        <g opacity={featureOpacity}>
          <line
            x1={cx - rx * 0.55}
            y1={mouthY}
            x2={cx + rx * 0.55}
            y2={mouthY}
            stroke={MOUTH_COLOR}
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <circle cx={cx + rx * 0.55} cy={mouthY} r="2" fill={MOUTH_COLOR} />
        </g>

        {/* Centre crosshair dot */}
        <circle cx={cx} cy={eyeY} r="1.4" fill={AXIS_COLOR} />
      </g>

      {/* Static oval border */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={baseStroke} strokeWidth="2" />
      {/* Progress arc */}
      {progress > 0 && !captured && (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke="rgba(0,229,255,0.95)"
          strokeWidth="3.5"
          strokeDasharray={`${progress * circumference} ${circumference}`}
          strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
        />
      )}
      {/* Full ring when captured */}
      {captured && (
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="rgba(0,229,255,0.9)" strokeWidth="3.5" />
      )}
    </svg>
  );
}

export default Capture;
