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

import { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { initDetector, setRunningMode, detectVideoFrame, isDetectorReady } from '@/lib/face/detector';
import { extractPose } from '@/lib/face/pose';
import { cropAndUploadFeatures, loadImageFromBlob } from '@/lib/face/uploadCrops';
import { useFaceStore } from '@/stores/faceStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { captureEvent } from '@/lib/analytics';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

// ── Types & constants ─────────────────────────────────────────────────────────

type Step =
  | 'loading'
  | 'detecting_front' | 'captured_front'
  | 'uploading' | 'done' | 'error';

const STABLE_MS = 1200;
const MIN_FACE_RATIO = 0.18;
const YAW_MAX = 8;
const PITCH_MAX = 8;

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

  const [step, setStep] = useState<Step>('loading');
  const [hasFace, setHasFace] = useState(false);
  const [stableProgress, setStableProgress] = useState(0);
  const [cameraError, setCameraError] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showFlash, setShowFlash] = useState(false);

  // ── Detector init ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    initDetector()
      .then(() => setRunningMode('VIDEO'))
      .then(() => {
        if (!cancelled) {
          setStep('detecting_front');
          captureEvent('capture_started');
        }
      })
      .catch(err => {
        console.error('[FaceBlame] FaceLandmarker init failed', err);
        if (!cancelled) setStep('error');
      });
    return () => { cancelled = true; };
  }, []);

  // ── Detection loop ─────────────────────────────────────────────────────────

  const runDetection = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState < 2 || !isDetectorReady()) {
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    if (step !== 'detecting_front') return;

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
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const lms = result.faceLandmarks[0];
    const xs = lms.map(l => l.x), ys = lms.map(l => l.y);
    const faceArea =
      (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (faceArea < MIN_FACE_RATIO) {
      setHasFace(false);
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    setHasFace(true);

    const pose = extractPose(result);
    if (!pose) {
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    if (Math.abs(pose.yaw) < YAW_MAX && Math.abs(pose.pitch) < PITCH_MAX) {
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
      stableStartRef.current = null;
      setStableProgress(0);
    }

    rafRef.current = requestAnimationFrame(runDetection);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step === 'detecting_front') rafRef.current = requestAnimationFrame(runDetection);
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
    const xs = lms.map(l => l.x * vw);
    const ys = lms.map(l => l.y * vh);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
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
    if (sx < 0) { sx = 0; cropW = vw; }
    if (sy < 0) { sy = 0; cropH = vh; }

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror to match selfie-mirrored preview
    ctx.translate(OUTPUT_W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, OUTPUT_W, OUTPUT_H);

    // Normalized bbox of the face within the cropped output (0..1)
    // Account for the horizontal mirror (1 - x)
    const bbox = {
      x: 1 - ((cx - sx) + fw / 2) / cropW,
      y: (cy - sy - fh / 2) / cropH,
      w: fw / cropW,
      h: fh / cropH,
    };

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      addFrame({
        angle: 'front',
        imageDataUrl: URL.createObjectURL(blob),
        blob,
        landmarkResult,
        blurScore: 0,
        faceConfidence: 1,
        // @ts-expect-error — added at runtime; bbox stored alongside frame
        bbox,
      });
      setStep('captured_front');
      setTimeout(() => setStep('uploading'), 900);
    }, 'image/jpeg', 0.92);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (step === 'uploading') uploadAllFrames();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadAllFrames = async () => {
    if (!user) return;
    setUploadError('');
    try {
      let { data: selfPerson } = await supabase
        .from('persons')
        .select('id')
        .eq('owner_user_id', user.id)
        .eq('is_self', true)
        .maybeSingle();

      if (!selfPerson) {
        const { data: np, error: pe } = await supabase
          .from('persons')
          .insert({
            owner_user_id: user.id,
            display_name: 'Me',
            relationship_tag: 'self',
            generation: 0,
            is_self: true,
          })
          .select('id')
          .single();
        if (pe) throw pe;
        selfPerson = np;
      }

      for (const frame of Object.values(frames)) {
        if (!frame) continue;
        const path = `${user.id}/self/${frame.angle}_${Date.now()}.jpg`;

        const { error: se } = await supabase.storage
          .from('face-images-raw')
          .upload(path, frame.blob, { contentType: 'image/jpeg' });
        if (se) throw se;

        const { data: imgRow, error: ie } = await supabase
          .from('face_images')
          .insert({
            person_id: selfPerson.id,
            storage_path: path,
            angle: frame.angle,
            capture_method: 'guided_capture',
            face_confidence: frame.faceConfidence,
          })
          .select('id')
          .single();
        if (ie) throw ie;

        const lms = frame.landmarkResult;
        const matrices = lms.facialTransformationMatrixes;
        const matrixArr = matrices?.[0]?.data ? Array.from(matrices[0].data) : null;
        // bbox is attached to the frame at capture time
        const bbox = (frame as unknown as { bbox?: { x: number; y: number; w: number; h: number } }).bbox ?? null;
        await supabase.from('face_landmarks').insert({
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
          await cropAndUploadFeatures(
            selfPerson.id,
            imgRow.id,
            sourceImg,
            frame.landmarkResult,
            frame.angle,
          );
        } catch (cropErr) {
          console.warn('[Capture] Feature crop upload failed:', cropErr);
        }
      }

      clearFrames();
      captureEvent('capture_done');
      await queryClient.invalidateQueries({ queryKey: ['persons', user.id] });
      setStep('done');
    } catch (err) {
      console.error('[FaceBlame] Upload failed', err);
      setUploadError('Upload failed. Tap retry.');
      setStep('error');
    }
  };

  const retry = () => { clearFrames(); setStep('detecting_front'); };

  // ── Done ───────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <CheckCircle2 size={72} className="text-cyan" />
        </motion.div>
        <h1 className="text-2xl font-bold">All done!</h1>
        <p className="text-muted-foreground text-center text-sm">
          Your photo is saved. Add family members next.
        </p>
        <button
          className="btn-gradient px-8 py-3"
          onClick={() => navigate('/home')}
        >
          Back to home
        </button>
      </div>
    );
  }

  const isCapturedStep = step === 'captured_front';

  return (
    <div className="relative flex flex-col min-h-screen bg-black overflow-hidden">
      {/* Camera feed */}
      {!cameraError && (
        <Webcam
          ref={webcamRef}
          audio={false}
          videoConstraints={{
            facingMode: 'user',
            width: { ideal: 768 },
            height: { ideal: 1024 },
            aspectRatio: 3 / 4,
          }}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.92}
          className="absolute inset-0 w-full h-full object-cover"
          onUserMediaError={() => setCameraError(true)}
          mirrored
        />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70 pointer-events-none" />

      {/* Capture flash */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            className="absolute inset-0 bg-white pointer-events-none z-30"
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Oval overlay */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ marginTop: '-5%' }}
      >
        <div className="relative">
          <OvalOverlay
            progress={stableProgress}
            hasFace={hasFace}
            captured={isCapturedStep}
          />
          <AnimatePresence>
            {hasFace && !isCapturedStep && step !== 'loading' && (
              <motion.div
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-cyan bg-cyan/10 border border-cyan/30 rounded-full px-3 py-1"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
              >
                Face detected
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {isCapturedStep && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <div className="bg-black/60 rounded-full p-4 backdrop-blur-sm border border-cyan/40">
                  <CheckCircle2 size={48} className="text-cyan" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Top instruction bar */}
      <div className="relative z-10 pt-16 px-6 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="space-y-1"
          >
            {step === 'loading' && (
              <p className="text-white/80 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Loading face detector…
              </p>
            )}
            {step === 'detecting_front' && (
              <>
                <p className="text-xs text-white/50 uppercase tracking-widest">
                  Align your face
                </p>
                <p className="text-white font-semibold text-lg">
                  Look straight at the camera
                </p>
                <p className="text-white/50 text-sm">
                  Centre your face inside the oval
                </p>
              </>
            )}
            {isCapturedStep && (
              <>
                <p className="text-xs text-cyan/70 uppercase tracking-widest">
                  ✓ Captured
                </p>
                <p className="text-white font-semibold text-lg">
                  Saving your photo…
                </p>
              </>
            )}
            {step === 'uploading' && (
              <p className="text-white/80 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Saving your photo…
              </p>
            )}
            {step === 'error' && (
              <p className="text-red-400">{uploadError || 'Detector failed to load.'}</p>
            )}
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
          <button
            className="btn-gradient px-6 py-2 text-sm"
            onClick={() => navigate('/home')}
          >
            Go back
          </button>
        </div>
      )}

      {/* Retry on error */}
      {step === 'error' && (
        <div className="absolute bottom-12 inset-x-0 flex justify-center z-20">
          <button
            className="flex items-center gap-2 btn-gradient px-6 py-3"
            onClick={retry}
          >
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      )}
    </div>
  );
};

// ── Oval overlay with high-precision alignment grid ──────────────────────────

function OvalOverlay({
  progress,
  hasFace,
  captured,
}: {
  progress: number;
  hasFace: boolean;
  captured: boolean;
}) {
  const circumference = 816;

  const baseStroke = captured
    ? 'rgba(0,229,255,0.9)'
    : hasFace
    ? 'rgba(255,255,255,0.6)'
    : 'rgba(255,255,255,0.25)';

  // Grid line opacity & color — brightens with face presence, cyan when locked
  const gridColor = captured
    ? 'rgba(0,229,255,0.7)'
    : hasFace
    ? 'rgba(255,255,255,0.5)'
    : 'rgba(255,255,255,0.25)';

  // Oval geometry (must match clip mask)
  const cx = 130, cy = 170, rx = 110, ry = 150;

  // Feature alignment lines (relative to oval bounding box)
  const top = cy - ry;
  const left = cx - rx;
  const right = cx + rx;
  const eyeY = top + ry * 2 * 0.33;     // ~33% from top
  const noseY = top + ry * 2 * 0.58;    // ~58%
  const mouthY = top + ry * 2 * 0.72;   // ~72%

  return (
    <svg width="260" height="340" viewBox="0 0 260 340">
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
        {/* Vertical centre (nose axis) */}
        <line
          x1={cx} y1={top} x2={cx} y2={cy + ry}
          stroke={gridColor}
          strokeWidth="0.75"
          strokeDasharray="3 4"
        />
        {/* Eye line */}
        <line
          x1={left} y1={eyeY} x2={right} y2={eyeY}
          stroke={gridColor}
          strokeWidth="0.75"
          strokeDasharray="3 4"
        />
        {/* Nose-tip line (shorter) */}
        <line
          x1={cx - rx * 0.4} y1={noseY} x2={cx + rx * 0.4} y2={noseY}
          stroke={gridColor}
          strokeWidth="0.75"
          strokeDasharray="2 3"
        />
        {/* Mouth line */}
        <line
          x1={cx - rx * 0.55} y1={mouthY} x2={cx + rx * 0.55} y2={mouthY}
          stroke={gridColor}
          strokeWidth="0.75"
          strokeDasharray="3 4"
        />
        {/* Rule-of-thirds vertical thirds */}
        <line
          x1={left + (rx * 2) / 3} y1={top} x2={left + (rx * 2) / 3} y2={cy + ry}
          stroke={gridColor} strokeWidth="0.4" strokeDasharray="1 4" opacity="0.7"
        />
        <line
          x1={left + (rx * 4) / 3} y1={top} x2={left + (rx * 4) / 3} y2={cy + ry}
          stroke={gridColor} strokeWidth="0.4" strokeDasharray="1 4" opacity="0.7"
        />
        {/* Centre crosshair dot */}
        <circle cx={cx} cy={eyeY} r="1.4" fill={gridColor} />
      </g>

      {/* Static oval border */}
      <ellipse
        cx={cx} cy={cy} rx={rx} ry={ry}
        fill="none"
        stroke={baseStroke}
        strokeWidth="2"
      />
      {/* Progress arc */}
      {progress > 0 && !captured && (
        <ellipse
          cx={cx} cy={cy} rx={rx} ry={ry}
          fill="none"
          stroke="rgba(0,229,255,0.95)"
          strokeWidth="3.5"
          strokeDasharray={`${progress * circumference} ${circumference}`}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
        />
      )}
      {/* Full ring when captured */}
      {captured && (
        <ellipse
          cx={cx} cy={cy} rx={rx} ry={ry}
          fill="none"
          stroke="rgba(0,229,255,0.9)"
          strokeWidth="3.5"
        />
      )}
    </svg>
  );
}

export default Capture;
