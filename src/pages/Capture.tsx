/**
 * /capture — 3-angle guided capture screen.
 *
 * State machine:
 *   loading → detecting_front → captured_front →
 *             detecting_left  → captured_left  →
 *             detecting_right → captured_right → uploading → done
 *
 * Advance rules (§6.3):
 *   Front:  |yaw| < 5°  && |pitch| < 5°  stable ≥ 1.5 s
 *   Left:   yaw ∈ [+45°, +75°]           stable ≥ 1.5 s
 *   Right:  yaw ∈ [−75°, −45°]           stable ≥ 1.5 s
 *   Face bbox ≥ 15% of frame area.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { initDetector, setRunningMode, detectVideoFrame, isDetectorReady } from '@/lib/face/detector';
import { extractPose } from '@/lib/face/pose';
import { useFaceStore } from '@/stores/faceStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { CaptureAngle } from '@/stores/faceStore';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

// ── Types & constants ─────────────────────────────────────────────────────────

type Step =
  | 'loading'
  | 'detecting_front' | 'captured_front'
  | 'detecting_left'  | 'captured_left'
  | 'detecting_right' | 'captured_right'
  | 'uploading' | 'done' | 'error';

const STABLE_MS = 1500;
const MIN_FACE_RATIO = 0.15;

type AngleSpec = {
  label: string;
  instruction: string;
  angle: CaptureAngle;
  detecting: Step;
  captured: Step;
  next: Step;
  inRange: (yaw: number, pitch: number) => boolean;
};

const ANGLE_SEQUENCE: AngleSpec[] = [
  {
    label: 'Front',
    instruction: 'Look straight at the camera',
    angle: 'front',
    detecting: 'detecting_front',
    captured: 'captured_front',
    next: 'detecting_left',
    inRange: (yaw, pitch) => Math.abs(yaw) < 5 && Math.abs(pitch) < 5,
  },
  {
    label: 'Left side',
    instruction: 'Turn your head to the left',
    angle: 'left',
    detecting: 'detecting_left',
    captured: 'captured_left',
    next: 'detecting_right',
    inRange: (yaw) => yaw >= 45 && yaw <= 75,
  },
  {
    label: 'Right side',
    instruction: 'Turn your head to the right',
    angle: 'right',
    detecting: 'detecting_right',
    captured: 'captured_right',
    next: 'uploading',
    inRange: (yaw) => yaw <= -45 && yaw >= -75,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

const Capture = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const webcamRef = useRef<Webcam>(null);
  const rafRef = useRef<number>(0);
  const stableStartRef = useRef<number | null>(null);

  const { addFrame, clearFrames, frames } = useFaceStore();

  const [step, setStep] = useState<Step>('loading');
  const [confidence, setConfidence] = useState(0);
  const [stableProgress, setStableProgress] = useState(0);
  const [cameraError, setCameraError] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const currentSpec = ANGLE_SEQUENCE.find(
    s => s.detecting === step || s.captured === step,
  );

  // ── Detector init ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    initDetector()
      .then(() => setRunningMode('VIDEO'))
      .then(() => { if (!cancelled) setStep('detecting_front'); })
      .catch(err => console.error('FaceLandmarker init failed', err));
    return () => { cancelled = true; };
  }, []);

  // ── Detection loop ─────────────────────────────────────────────────────────

  const runDetection = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState < 2 || !isDetectorReady()) {
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const spec = ANGLE_SEQUENCE.find(s => s.detecting === step);
    if (!spec) return;

    const result: FaceLandmarkerResult = detectVideoFrame(video, performance.now());
    const pose = extractPose(result);
    const hasFace = (result.faceLandmarks?.length ?? 0) > 0;
    setConfidence(hasFace ? 1 : 0);

    if (!pose || !hasFace) {
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    // Face size guard
    const lms = result.faceLandmarks[0];
    const xs = lms.map(l => l.x), ys = lms.map(l => l.y);
    const faceArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (faceArea < MIN_FACE_RATIO) {
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    if (spec.inRange(pose.yaw, pose.pitch)) {
      const now = performance.now();
      if (!stableStartRef.current) stableStartRef.current = now;
      const elapsed = now - stableStartRef.current;
      setStableProgress(Math.min(elapsed / STABLE_MS, 1));

      if (elapsed >= STABLE_MS) {
        stableStartRef.current = null;
        setStableProgress(0);
        captureFrame(spec, result);
        return;
      }
    } else {
      stableStartRef.current = null;
      setStableProgress(0);
    }

    rafRef.current = requestAnimationFrame(runDetection);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const isDetecting = ANGLE_SEQUENCE.some(s => s.detecting === step);
    if (isDetecting) rafRef.current = requestAnimationFrame(runDetection);
    return () => cancelAnimationFrame(rafRef.current);
  }, [step, runDetection]);

  // ── Capture ────────────────────────────────────────────────────────────────

  const captureFrame = (spec: AngleSpec, landmarkResult: FaceLandmarkerResult) => {
    const screenshot = webcamRef.current?.getScreenshot({ width: 1280, height: 720 });
    if (!screenshot) return;
    navigator.vibrate?.(30);

    fetch(screenshot)
      .then(r => r.blob())
      .then(blob => {
        addFrame({
          angle: spec.angle,
          imageDataUrl: screenshot,
          blob,
          landmarkResult,
          blurScore: 0,
          faceConfidence: 1,
        });
        setStep(spec.captured);
        setTimeout(() => setStep(spec.next), 800);
      });
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (step === 'uploading') uploadAllFrames();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadAllFrames = async () => {
    if (!user) return;
    setUploadError('');
    try {
      // Ensure self-person row
      let { data: selfPerson } = await supabase
        .from('persons')
        .select('id')
        .eq('owner_user_id', user.id)
        .eq('is_self', true)
        .maybeSingle();

      if (!selfPerson) {
        const { data: np, error: pe } = await supabase
          .from('persons')
          .insert({ owner_user_id: user.id, display_name: 'Me', relationship_tag: 'self', generation: 0, is_self: true })
          .select('id').single();
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
          .insert({ person_id: selfPerson.id, storage_path: path, angle: frame.angle, capture_method: 'guided_capture', face_confidence: frame.faceConfidence })
          .select('id').single();
        if (ie) throw ie;

        const lms = frame.landmarkResult;
        const matrices = lms.facialTransformationMatrixes;
        const matrixArr = matrices?.[0]?.data ? Array.from(matrices[0].data) : null;
        await supabase.from('face_landmarks').insert({
          face_image_id: imgRow.id,
          landmarks_json: { landmarks: lms.faceLandmarks?.[0] ?? [], matrix: matrixArr },
        });
      }

      clearFrames();
      setStep('done');
    } catch (err) {
      console.error('Upload failed', err);
      setUploadError('Upload failed. Tap retry.');
      setStep('error');
    }
  };

  const retry = () => { clearFrames(); setStep('detecting_front'); };

  // ── Done ───────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
          <CheckCircle2 size={72} className="text-cyan" />
        </motion.div>
        <h1 className="text-2xl font-bold">All done!</h1>
        <p className="text-muted-foreground text-center text-sm">Your 3 angles are saved. Add family members next.</p>
        <button className="btn-gradient px-8 py-3" onClick={() => navigate('/home')}>Back to home</button>
      </div>
    );
  }

  const angleIndex = ANGLE_SEQUENCE.findIndex(s => s.detecting === step || s.captured === step);

  return (
    <div className="relative flex flex-col min-h-screen bg-black overflow-hidden">
      {!cameraError && (
        <Webcam
          ref={webcamRef}
          audio={false}
          videoConstraints={{ facingMode: 'user', width: 1280, height: 720 }}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.92}
          className="absolute inset-0 w-full h-full object-cover"
          onUserMediaError={() => setCameraError(true)}
          mirrored
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

      {/* Oval */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginTop: '-5%' }}>
        <OvalOverlay progress={stableProgress} hasFace={confidence > 0} />
      </div>

      {/* Instruction */}
      <div className="relative z-10 pt-16 px-6 text-center">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="space-y-1">
            {step === 'loading' && <p className="text-white/80 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading face detector…</p>}
            {currentSpec && (
              <>
                <p className="text-xs text-white/50 uppercase tracking-widest">Step {angleIndex + 1} of 3 — {currentSpec.label}</p>
                <p className="text-white font-semibold text-lg">{currentSpec.instruction}</p>
              </>
            )}
            {step === 'uploading' && <p className="text-white/80 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Saving your photos…</p>}
            {step === 'error' && <p className="text-red-400">{uploadError}</p>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step dots */}
      <div className="absolute bottom-28 inset-x-0 flex justify-center gap-3 z-10">
        {ANGLE_SEQUENCE.map((s, i) => {
          const done = angleIndex > i || step === 'uploading' || step === 'done';
          const active = i === angleIndex;
          return <div key={s.angle} className={`w-2.5 h-2.5 rounded-full transition-all ${done ? 'bg-cyan' : active ? 'bg-white' : 'bg-white/30'}`} />;
        })}
      </div>

      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 bg-black px-6 text-center">
          <p className="text-white/80">Camera access denied or unavailable.</p>
          <button className="btn-gradient px-6 py-2 text-sm" onClick={() => navigate('/home')}>Go back</button>
        </div>
      )}

      {step === 'error' && (
        <div className="absolute bottom-12 inset-x-0 flex justify-center z-20">
          <button className="flex items-center gap-2 btn-gradient px-6 py-3" onClick={retry}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      )}
    </div>
  );
};

// ── Oval overlay ──────────────────────────────────────────────────────────────

function OvalOverlay({ progress, hasFace }: { progress: number; hasFace: boolean }) {
  const strokeColor = hasFace
    ? progress > 0 ? `rgba(0,229,255,${0.5 + progress * 0.5})` : 'rgba(255,255,255,0.5)'
    : 'rgba(255,255,255,0.25)';

  // Ellipse circumference ≈ 2π√((a²+b²)/2) for a=110, b=150
  const circumference = 816;

  return (
    <svg width="260" height="340" viewBox="0 0 260 340">
      <defs>
        <mask id="oval-mask">
          <rect width="260" height="340" fill="white" />
          <ellipse cx="130" cy="170" rx="110" ry="150" fill="black" />
        </mask>
      </defs>
      <rect width="260" height="340" fill="rgba(0,0,0,0.4)" mask="url(#oval-mask)" />
      <ellipse cx="130" cy="170" rx="110" ry="150" fill="none" stroke={strokeColor} strokeWidth="2" />
      {progress > 0 && (
        <ellipse
          cx="130" cy="170" rx="110" ry="150"
          fill="none"
          stroke="rgba(0,229,255,0.9)"
          strokeWidth="3"
          strokeDasharray={`${progress * circumference} ${circumference}`}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '130px 170px' }}
        />
      )}
    </svg>
  );
}

export default Capture;
