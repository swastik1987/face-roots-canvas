/**
 * /family/add — Add a family member via photo upload.
 *
 * Flow:
 *   pick → detecting → crop → confirm → saving → done
 *
 *   pick:      file picker
 *   detecting: MediaPipe face detection
 *   crop:      show detected face bbox on the image; user confirms
 *   confirm:   name + relationship form with crop preview
 *   saving:    upload to Supabase
 *   done:      success screen
 */

import { useRef, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle2, AlertCircle, CropIcon, RotateCcw, Pencil } from "lucide-react";
import { initDetector, setRunningMode, detectImage } from "@/lib/face/detector";
import { extractPose } from "@/lib/face/pose";
import { cropAndUploadFeatures } from "@/lib/face/uploadCrops";
import { replacePersonFaceImages } from "@/lib/face/replaceFaceImage";
import { normalizeToPortrait } from "@/lib/face/normalize";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import FaceCropDialog from "@/components/FaceCropDialog";

const spring = { type: "spring" as const, stiffness: 260, damping: 20 };

const RELATIONSHIP_OPTIONS = [
  { label: "Mother", tag: "mother", generation: 1 },
  { label: "Father", tag: "father", generation: 1 },
  { label: "Maternal Grandma", tag: "maternal_grandma", generation: 2 },
  { label: "Maternal Grandpa", tag: "maternal_grandpa", generation: 2 },
  { label: "Paternal Grandma", tag: "paternal_grandma", generation: 2 },
  { label: "Paternal Grandpa", tag: "paternal_grandpa", generation: 2 },
  { label: "Sibling", tag: "sibling", generation: 0 },
  { label: "Uncle", tag: "uncle", generation: 1 },
  { label: "Aunt", tag: "aunt", generation: 1 },
  { label: "Child", tag: "child", generation: -1 },
  { label: "Other", tag: "other", generation: 0 },
];

type Phase = "pick" | "detecting" | "choose_face" | "crop" | "confirm" | "saving" | "done" | "error";

type FaceCandidate = {
  index: number;
  bbox: { x: number; y: number; w: number; h: number };
  landmarks: Array<{ x: number; y: number; z: number }>;
};

// Near-frontal gate for family uploads. Capture.tsx uses a stricter 8°
// threshold for live self-capture; for static photo uploads we allow a
// wider but still roughly head-on angle so portraits at slight angles pass.
const FAMILY_YAW_MAX = 45;
const FAMILY_PITCH_MAX = 30;

// ── Face crop helper ──────────────────────────────────────────────────────────

/** Compute face bbox (normalised 0-1) from all landmarks, then pad by pct. */
function getBbox(
  landmarks: Array<{ x: number; y: number; z: number }>,
  pad = 0.2,
): { x: number; y: number; w: number; h: number } {
  const xs = landmarks.map((l) => l.x);
  const ys = landmarks.map((l) => l.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bw = maxX - minX;
  const bh = maxY - minY;
  return {
    x: Math.max(0, minX - bw * pad),
    y: Math.max(0, minY - bh * pad),
    w: Math.min(1 - Math.max(0, minX - bw * pad), bw + bw * pad * 2),
    h: Math.min(1 - Math.max(0, minY - bh * pad), bh + bh * pad * 2),
  };
}

function transformLandmarksToCrop(
  landmarks: Array<{ x: number; y: number; z?: number; visibility?: number }>,
  bbox: { x: number; y: number; w: number; h: number },
) {
  return landmarks.map((lm) => ({
    ...lm,
    x: Math.min(1, Math.max(0, (lm.x - bbox.x) / bbox.w)),
    y: Math.min(1, Math.max(0, (lm.y - bbox.y) / bbox.h)),
  }));
}

/** Draw full image to canvas and extract the face-bbox region as a Blob. */
async function cropFaceBlob(
  img: HTMLImageElement,
  bbox: { x: number; y: number; w: number; h: number },
  outputSize = 512,
): Promise<{ blob: Blob; dataUrl: string }> {
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d")!;

  const sx = bbox.x * img.naturalWidth;
  const sy = bbox.y * img.naturalHeight;
  const sw = bbox.w * img.naturalWidth;
  const sh = bbox.h * img.naturalHeight;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92));
  return { blob, dataUrl };
}

// ── Component ─────────────────────────────────────────────────────────────────

const FamilyAdd = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("pick");
  const [errorMsg, setErrorMsg] = useState("");
  const [previewUrl, setPreviewUrl] = useState(""); // full image object URL
  const [cropUrl, setCropUrl] = useState(""); // cropped face data URL
  const [cropBlob, setCropBlob] = useState<Blob | null>(null);
  const [detectionResult, setDetectionResult] = useState<FaceLandmarkerResult | null>(null);
  const [bboxPercent, setBboxPercent] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [name, setName] = useState("");
  const isSelfMode = searchParams.get("self") === "1";
  const [relationTag, setRelationTag] = useState(
    isSelfMode ? "self" : (searchParams.get("tag") ?? ""),
  );
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [faceCandidates, setFaceCandidates] = useState<FaceCandidate[]>([]);
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number>(0);
  const [pendingDetection, setPendingDetection] = useState<FaceLandmarkerResult | null>(null);
  // When present, we're replacing the photo of an existing person (self or
  // family) instead of adding a new one. Skips the persons insert and re-uses
  // the existing row; the replace helper purges the old face_images + crops.
  const replacePersonId = searchParams.get("person_id");

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Effective person id to replace (explicit param OR existing self in self mode).
  const [effectiveReplaceId, setEffectiveReplaceId] = useState<string | null>(replacePersonId);

  // Pre-fill name/relationship when re-uploading for an existing person,
  // or when in self mode (look up existing self to replace).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (replacePersonId) {
        const { data } = await supabase
          .from("persons")
          .select("display_name, relationship_tag")
          .eq("id", replacePersonId)
          .maybeSingle();
        if (cancelled || !data) return;
        setName(data.display_name ?? "");
        setRelationTag(data.relationship_tag ?? "");
        return;
      }
      if (isSelfMode && user) {
        const { data } = await supabase
          .from("persons")
          .select("id, display_name")
          .eq("owner_user_id", user.id)
          .eq("is_self", true)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          setEffectiveReplaceId(data.id);
          setName(data.display_name ?? "Me");
        } else {
          setName((prev) => prev || "Me");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [replacePersonId, isSelfMode, user]);

  // ── File pick + detection ──────────────────────────────────────────────────

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please select an image file.");
      setPhase("error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("Image must be smaller than 10 MB.");
      setPhase("error");
      return;
    }

    setPhase("detecting");
    setErrorMsg("");

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    try {
      await initDetector();
      await setRunningMode("IMAGE");

      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image failed to load"));
      });
      const result = detectImage(img);
      const numFaces = result.faceLandmarks?.length ?? 0;

      if (numFaces === 0) {
        setErrorMsg("No face found in this photo. Please try a clearer front-facing portrait.");
        setPhase("error");
        URL.revokeObjectURL(url);
        setPreviewUrl("");
        return;
      }

      // Multiple faces → let the user pick which one is theirs/the relative's.
      if (numFaces > 1) {
        const candidates: FaceCandidate[] = result.faceLandmarks.map((lms, i) => ({
          index: i,
          bbox: getBbox(lms, 0.2),
          landmarks: lms,
        }));
        setFaceCandidates(candidates);
        setSelectedFaceIndex(0);
        setPendingDetection(result);
        setPhase("choose_face");
        return;
      }

      // Single face — original pose gate + auto-crop path.
      const pose = extractPose(result);
      if (pose) {
        if (Math.abs(pose.yaw) > FAMILY_YAW_MAX) {
          setErrorMsg(
            `This photo is turned ${Math.abs(Math.round(pose.yaw))}° off-centre. Please upload a near-frontal portrait (within ${FAMILY_YAW_MAX}°).`,
          );
          setPhase("error");
          URL.revokeObjectURL(url);
          setPreviewUrl("");
          return;
        }
        if (Math.abs(pose.pitch) > FAMILY_PITCH_MAX) {
          setErrorMsg(
            `This photo is tilted ${Math.abs(Math.round(pose.pitch))}° up/down. Please upload a more level portrait (within ${FAMILY_PITCH_MAX}°).`,
          );
          setPhase("error");
          URL.revokeObjectURL(url);
          setPreviewUrl("");
          return;
        }
      }

      const landmarks = result.faceLandmarks[0];
      const bbox = getBbox(landmarks, 0.2);
      setBboxPercent(bbox);
      setDetectionResult(result);

      const { blob, dataUrl } = await cropFaceBlob(img, bbox);
      setCropBlob(blob);
      setCropUrl(dataUrl);

      setPhase("crop");
    } catch (err) {
      console.error("Detection error", err);
      setErrorMsg("Could not analyse the photo. Please try another image.");
      setPhase("error");
    }
  };

  // ── Confirm a face from the multi-face picker ─────────────────────────────
  const confirmChosenFace = async () => {
    const cand = faceCandidates[selectedFaceIndex];
    if (!cand || !previewUrl || !pendingDetection) return;

    try {
      const img = new Image();
      img.src = previewUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image failed to load"));
      });

      // Build a single-face detection result so downstream code (which reads
      // index 0) operates on the chosen face.
      const singleResult: FaceLandmarkerResult = {
        ...pendingDetection,
        faceLandmarks: [cand.landmarks as any],
        facialTransformationMatrixes: pendingDetection.facialTransformationMatrixes
          ? [pendingDetection.facialTransformationMatrixes[cand.index]].filter(Boolean) as any
          : ([] as any),
        faceBlendshapes: pendingDetection.faceBlendshapes
          ? [pendingDetection.faceBlendshapes[cand.index]].filter(Boolean) as any
          : ([] as any),
      };

      setBboxPercent(cand.bbox);
      setDetectionResult(singleResult);

      const { blob, dataUrl } = await cropFaceBlob(img, cand.bbox);
      setCropBlob(blob);
      setCropUrl(dataUrl);
      setPhase("crop");
    } catch (err) {
      console.error("Face selection error", err);
      setErrorMsg("Could not use that face. Please try a different photo.");
      setPhase("error");
    }
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!user || !cropBlob) return;
    if (!name.trim()) {
      setErrorMsg("Please enter a name.");
      return;
    }
    if (!relationTag) {
      setErrorMsg("Please select a relationship.");
      return;
    }

    setPhase("saving");
    setErrorMsg("");

    try {
      const rel = RELATIONSHIP_OPTIONS.find((r) => r.tag === relationTag);
      const generation = isSelfMode ? 0 : (rel?.generation ?? 0);
      const tag = isSelfMode ? "self" : relationTag;

      // Replace mode: re-use the existing person row; otherwise insert a new one.
      let person: { id: string };
      const replaceId = effectiveReplaceId;
      if (replaceId) {
        const { data: updated, error: ue } = await supabase
          .from("persons")
          .update({
            display_name: name.trim(),
            relationship_tag: tag,
            generation,
          })
          .eq("id", replaceId)
          .eq("owner_user_id", user.id)
          .select("id")
          .single();
        if (ue) throw ue;
        person = updated;
      } else {
        const { data: inserted, error: pe } = await supabase
          .from("persons")
          .insert({
            owner_user_id: user.id,
            display_name: name.trim(),
            relationship_tag: tag,
            generation,
            is_self: isSelfMode,
          })
          .select("id")
          .single();
        if (pe) throw pe;
        person = inserted;
      }

      // 1. Detect landmarks directly on the final normalized crop blob
      const normalizedCropBlob = await normalizeToPortrait(cropBlob);
      await initDetector();
      await setRunningMode("IMAGE");
      const croppedImgForDetect = new Image();
      croppedImgForDetect.src = URL.createObjectURL(normalizedCropBlob);
      await new Promise<void>((resolve, reject) => {
        croppedImgForDetect.onload = () => resolve();
        croppedImgForDetect.onerror = () => reject(new Error("Failed to load cropped image for detection"));
      });

      const finalDetectionResult = detectImage(croppedImgForDetect);
      const finalLandmarks = finalDetectionResult.faceLandmarks?.[0] ?? [];
      const finalMatrices = finalDetectionResult.facialTransformationMatrixes?.[0]?.data
        ? Array.from(finalDetectionResult.facialTransformationMatrixes[0].data)
        : null;

      // 2. Upload the cropped face image
      const folder = isSelfMode ? "self" : "family";
      const path = `${user.id}/${folder}/${person.id}_${Date.now()}.jpg`;
      const { error: se } = await supabase.storage
        .from("face-images-raw")
        .upload(path, normalizedCropBlob, { contentType: "image/jpeg" });
      if (se) throw se;

      // 3. face_images row
      const { data: imgRow, error: ie } = await supabase
        .from("face_images")
        .insert({
          person_id: person.id,
          storage_path: path,
          angle: "front",
          capture_method: "upload_cropped",
          face_confidence: finalLandmarks.length > 0 ? 1 : 0,
        })
        .select("id")
        .single();
      if (ie) throw ie;

      // 4. face_landmarks — store accurate bbox + landmarks
      await supabase.from("face_landmarks").insert({
        face_image_id: imgRow.id,
        landmarks_json: {
          landmarks: finalLandmarks,
          matrix: finalMatrices,
          bbox: { x: 0, y: 0, w: 1, h: 1 },
        },
      });

      // 5. Crop features client-side
      if (finalLandmarks.length > 0) {
        try {
          await cropAndUploadFeatures(person.id, imgRow.id, croppedImgForDetect, finalDetectionResult, "front");
        } catch (cropErr) {
          console.warn("[FamilyAdd] Feature crop upload failed:", cropErr);
        }
      }
      URL.revokeObjectURL(croppedImgForDetect.src);

      // Purge any prior images for this person + mark analyses stale.
      await replacePersonFaceImages({
        userId: user.id,
        personId: person.id,
        keepFaceImageIds: [imgRow.id],
      });

      // Invalidate persons cache so Home re-fetches immediately
      await queryClient.invalidateQueries({ queryKey: ["persons", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["family-thumbnail"] });
      if (isSelfMode) {
        await queryClient.invalidateQueries({ queryKey: ["self-thumbnail"] });
      }

      setPhase("done");
    } catch (err) {
      console.error("Save failed", err);
      setErrorMsg("Failed to save. Please try again.");
      setPhase("error");
    }
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhase("pick");
    setPreviewUrl("");
    setCropUrl("");
    setCropBlob(null);
    setDetectionResult(null);
    setBboxPercent(null);
    setErrorMsg("");
    setName("");
    setRelationTag("");
    setFaceCandidates([]);
    setSelectedFaceIndex(0);
    setPendingDetection(null);
  };

  // ── Done ───────────────────────────────────────────────────────────────────

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <CheckCircle2 size={64} className="text-cyan" />
        </motion.div>
        <h1 className="text-xl font-bold">
          {isSelfMode ? "Your photo is saved!" : `${name} added!`}
        </h1>
        <button className="btn-gradient px-8 py-3" onClick={() => navigate("/home")}>
          {isSelfMode ? "Back to home" : "Back to family"}
        </button>
        {!isSelfMode && (
          <button className="text-sm text-muted-foreground underline underline-offset-2" onClick={reset}>
            Add another
          </button>
        )}
      </div>
    );
  }

  // ── Multi-face picker ──────────────────────────────────────────────────────

  if (phase === "choose_face") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 gap-6">
        <motion.div
          className="glass-card p-6 w-full max-w-sm space-y-5"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring}
        >
          <div className="space-y-1">
            <h1 className="text-lg font-bold">Multiple faces found</h1>
            <p className="text-sm text-muted-foreground">
              Tap the face you want to use{isSelfMode ? "" : " for this family member"}.
            </p>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-black">
            <img src={previewUrl} alt="Original" className="w-full h-auto block" />
            {faceCandidates.map((c, i) => {
              const selected = i === selectedFaceIndex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedFaceIndex(i)}
                  className="absolute group"
                  style={{
                    left: `${c.bbox.x * 100}%`,
                    top: `${c.bbox.y * 100}%`,
                    width: `${c.bbox.w * 100}%`,
                    height: `${c.bbox.h * 100}%`,
                  }}
                  aria-label={`Select face ${i + 1}`}
                >
                  <span
                    className={`absolute inset-0 border-2 rounded-md transition-all ${
                      selected
                        ? "border-cyan shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                        : "border-white/60 hover:border-white"
                    }`}
                  />
                  <span
                    className={`absolute -top-2 -left-2 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      selected ? "bg-cyan text-black" : "bg-white/80 text-black"
                    }`}
                  >
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            <button
              className="btn-gradient w-full py-3 text-sm font-medium"
              onClick={confirmChosenFace}
            >
              Use face #{selectedFaceIndex + 1}
            </button>
            <button
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/10 text-sm text-muted-foreground hover:bg-white/5 transition-colors"
              onClick={reset}
            >
              <RotateCcw size={14} />
              Try a different photo
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Crop confirmation screen ───────────────────────────────────────────────

  if (phase === "crop") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 gap-6">
        <motion.div
          className="glass-card p-6 w-full max-w-sm space-y-5"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring}
        >
          <div className="flex items-center gap-2">
            <CropIcon size={18} className="text-cyan" />
            <h1 className="text-lg font-bold">Face detected</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            We found a face in your photo. This is what we'll use for matching:
          </p>

          {/* Side-by-side: original with box + crop */}
          <div className="grid grid-cols-2 gap-3">
            {/* Original with bbox overlay */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground text-center">Original</p>
              <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
                <img src={previewUrl} alt="Original" className="w-full h-full object-cover" />
                {bboxPercent && (
                  <div
                    className="absolute border-2 border-cyan"
                    style={{
                      left: `${bboxPercent.x * 100}%`,
                      top: `${bboxPercent.y * 100}%`,
                      width: `${bboxPercent.w * 100}%`,
                      height: `${bboxPercent.h * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>

            {/* Cropped face */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground text-center">Face crop</p>
              <div className="rounded-xl overflow-hidden bg-black aspect-[3/4] flex items-center justify-center relative">
                {cropUrl && (
                  <>
                    <img src={cropUrl} alt="Face crop" className="w-full h-full object-cover" />
                    <div
                      className="absolute inset-0 pointer-events-none border-2 border-cyan/70 mask-oval"
                      style={{ borderRadius: "50% / 50%" }}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button className="btn-gradient w-full py-3 text-sm font-medium" onClick={() => setPhase("confirm")}>
              Looks good — continue
            </button>
            <button
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5 transition-colors"
              onClick={() => setShowCropDialog(true)}
            >
              <Pencil size={14} />
              Adjust crop
            </button>
            <button
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/10 text-sm text-muted-foreground hover:bg-white/5 transition-colors"
              onClick={reset}
            >
              <RotateCcw size={14} />
              Try a different photo
            </button>
          </div>
        </motion.div>

        {/* Adjust crop dialog */}
        <FaceCropDialog
          open={showCropDialog}
          onOpenChange={setShowCropDialog}
          imageUrl={previewUrl}
          onCropConfirm={(blob, dataUrl) => {
            setCropBlob(blob);
            setCropUrl(dataUrl);
            setShowCropDialog(false);
          }}
        />
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <motion.div
        className="glass-card p-8 w-full max-w-sm space-y-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
      >
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-center">
            {isSelfMode ? "Upload your photo" : "Add family member"}
          </h1>
          {/* Step indicator */}
          {(() => {
            const stepIdx =
              phase === 'pick' || phase === 'error' ? 0
              : phase === 'detecting' ? 1
              : phase === 'confirm' ? 2
              : phase === 'saving' ? 3
              : 0;
            const labels = ['Pick', 'Detect', 'Details', 'Save'];
            return (
              <div className="flex items-center justify-center gap-2" aria-label={`Step ${stepIdx + 1} of 4`}>
                {labels.map((label, i) => {
                  const active = i === stepIdx;
                  const done = i < stepIdx;
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={`w-2 h-2 rounded-full transition-colors ${
                            done ? 'bg-cyan' : active ? 'bg-gradient-to-r from-cyan to-magenta scale-150' : 'bg-white/20'
                          }`}
                        />
                        <span className={`text-[10px] uppercase tracking-wider ${active ? 'text-cyan' : 'text-muted-foreground/70'}`}>
                          {label}
                        </span>
                      </div>
                      {i < labels.length - 1 && <div className="w-6 h-px bg-white/10" />}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Photo picker / preview */}
        <AnimatePresence mode="wait">
          {phase === "pick" || phase === "error" ? (
            <motion.button
              key="picker"
              className="w-full h-40 rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={28} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Tap to upload a photo</span>
            </motion.button>
          ) : (
            <motion.div
              key="preview"
              className="w-full rounded-xl overflow-hidden relative"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Confirm phase: show crop preview */}
              {(phase === "confirm" || phase === "saving") && cropUrl ? (
                <div className="flex gap-3 items-center">
                  <div
                    className="w-20 h-28 relative rounded-full overflow-hidden border border-cyan/30"
                    style={{ borderRadius: "50% / 50%" }}
                  >
                    <img src={cropUrl} alt="Face crop" className="w-full h-full object-cover" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p className="text-foreground font-medium text-sm mb-0.5">Face confirmed</p>
                    <p>
                      {isSelfMode
                        ? "Confirm your name to save your portrait."
                        : "Fill in the details to save this family member."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-40 relative">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover rounded-xl" />
                  {phase === "detecting" && (
                    <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center gap-2">
                      <Loader2 size={20} className="animate-spin text-white" />
                      <span className="text-white text-sm">Detecting face…</span>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />

        {phase === "error" && errorMsg && (
          <div className="flex items-start gap-2 text-destructive text-xs">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Name + relationship — only shown in confirm/saving */}
        {(phase === "confirm" || phase === "saving") && (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. Maria"
                className="bg-white/5 border-white/10"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={phase === "saving"}
                autoFocus
              />
            </div>

            {!isSelfMode && (
              <div className="space-y-2">
                <Label>Relationship</Label>
                <Select value={relationTag} onValueChange={setRelationTag} disabled={phase === "saving"}>
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <SelectItem key={r.tag} value={r.tag}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}

            <div className="flex flex-col gap-2">
              <button
                className="btn-gradient w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50"
                onClick={handleSave}
                disabled={phase === "saving"}
              >
                {phase === "saving" && <Loader2 size={16} className="animate-spin" />}
                {isSelfMode ? "Save my photo" : "Save family member"}
              </button>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
                onClick={reset}
                disabled={phase === "saving"}
              >
                ← Start over
              </button>
            </div>
          </>
        )}

        {/* Re-pick after error */}
        {phase === "error" && (
          <button
            className="w-full py-3 rounded-full border border-white/10 text-sm text-muted-foreground hover:bg-white/5 transition-colors"
            onClick={reset}
          >
            Try a different photo
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default FamilyAdd;
