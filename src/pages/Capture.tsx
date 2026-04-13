/**
 * /capture — 3-angle guided capture screen.
 *
 * State machine:
 *   loading → detecting_front → captured_front →
 *             detecting_left  → captured_left  →
 *             detecting_right → captured_right → uploading → done
 *
 * Advance rules:
 *   Front:  |yaw| < 12° && |pitch| < 12° stable ≥ 1.5 s
 *   Left:   yaw ∈ [+35°, +80°]            stable ≥ 1.5 s
 *   Right:  yaw ∈ [−80°, −35°]            stable ≥ 1.5 s
 *   Face bbox ≥ 12% of frame area.
 *
 * (Ranges intentionally generous to accommodate real-world hand tremor
 * and varying device tilt.)
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
import { captureEvent } from '@/lib/analytics';
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
const MIN_FACE_RATIO = 0.12;

type AngleSpec = {
  label: string;
  instruction: string;
  hint: string;
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
    hint: 'Keep your face centred in the oval',
    angle: 'front',
    detecting: 'detecting_front',
    captured: 'captured_front',
    next: 'detecting_left',
    inRange: (yaw, pitch) => Math.abs(yaw) < 12 && Math.abs(pitch) < 12,
  },
  {
    label: 'Left side',
    instruction: 'Slowly turn your head left',
    hint: 'Turn until your ear is visible',
    angle: 'left',
    detecting: 'detecting_left',
    captured: 'captured_left',
    next: 'detecting_right',
    inRange: (yaw) => yaw >= 35 && yaw <= 80,
  },
  {
    label: 'Right side',
    instruction: 'Slowly turn your head right',
    hint: 'Turn until your other ear is visible',
    angle: 'right',
    detecting: 'detecting_right',
    captured: 'captured_right',
    next: 'uploading',
    inRange: (yaw) => yaw <= -35 && yaw >= -80,
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
  const [hasFace, setHasFace] = useState(false);
  const [stableProgress, setStableProgress] = useState(0);
  const [cameraError, setCameraError] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showFlash, setShowFlash] = useState(false);

  const currentSpec = ANGLE_SEQUENCE.find(
    s => s.detecting === step || s.captured === step,
  );
  const angleIndex = ANGLE_SEQUENCE.findIndex(
    s => s.detecting === step || s.captured === step,
  );

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

    const spec = ANGLE_SEQUENCE.find(s => s.detecting === step);
    if (!spec) return;

    let result: FaceLandmarkerResult;
    try {
      result = detectVideoFrame(video, performance.now());
    } catch {
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const facesFound = (result.faceLandmarks?.length ?? 0) > 0;
    setHasFace(facesFound);

    if (!facesFound) {
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    // Face size guard
    const lms = result.faceLandmarks[0];
    const xs = lms.map(l => l.x), ys = lms.map(l => l.y);
    const faceArea =
      (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (faceArea < MIN_FACE_RATIO) {
      stableStartRef.current = null;
      setStableProgress(0);
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const pose = extractPose(result);
    if (!pose) {
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

    // Trigger flash animation
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 400);

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
        setTimeout(() => setStep(spec.next), 900);
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
        await supabase.from('face_landmarks').insert({
          face_image_id: imgRow.id,
          landmarks_json: {
            landmarks: lms.faceLandmarks?.[0] ?? [],
            matrix: matrixArr,
          },
        });
      }

      clearFrames();
      captureEvent('capture_done');
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
          Your 3 angles are saved. Add family members next.
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

  const isCapturedStep =
    step === 'captured_front' ||
    step === 'captured_left' ||
    step === 'captured_right';

  return (
    <div className="relative flex flex-col min-h-screen bg-black overflow-hidden">
      {/* Camera feed */}
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
          {/* Face detected badge */}
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
          {/* Captured confirmation */}
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
            {currentSpec && !isCapturedStep && (
              <>
                <p className="text-xs text-white/50 uppercase tracking-widest">
                  Step {angleIndex + 1} of 3 — {currentSpec.label}
                </p>
                <p className="text-white font-semibold text-lg">
                  {currentSpec.instruction}
                </p>
                <p className="text-white/50 text-sm">{currentSpec.hint}</p>
              </>
            )}
            {isCapturedStep && currentSpec && (
              <>
                <p className="text-xs text-cyan/70 uppercase tracking-widest">
                  ✓ {currentSpec.label} captured
                </p>
                <p className="text-white font-semibold text-lg">
                  {angleIndex < 2 ? 'Great! Next angle…' : 'Last one! Almost there…'}
                </p>
              </>
            )}
            {step === 'uploading' && (
              <p className="text-white/80 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Saving your photos…
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
        <div className="absolute bottom-36 inset-x-0 px-10 z-10">
          <div className="h-1 rounded-full bg-white/15 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan to-fuchsia-500 rounded-full"
              style={{ width: `${stableProgress * 100}%` }}
            />
          </div>
          <p className="text-center text-xs text-white/40 mt-1">Hold still…</p>
        </div>
      )}

      {/* Step dots */}
      <div className="absolute bottom-28 inset-x-0 flex justify-center gap-3 z-10">
        {ANGLE_SEQUENCE.map((s, i) => {
          const done = angleIndex > i ||
            step === 'uploading' ||
            step === 'done';
          const active = i === angleIndex;
          return (
            <div
              key={s.angle}
              className={`transition-all rounded-full ${
                done
                  ? 'w-2.5 h-2.5 bg-cyan'
                  : active
                  ? 'w-4 h-2.5 bg-white'
                  : 'w-2.5 h-2.5 bg-white/25'
              }`}
            />
          );
        })}
      </div>

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

// ── Oval overlay ──────────────────────────────────────────────────────────────

function OvalOverlay({
  progress,
  hasFace,
  captured,
}: {
  progress: number;
  hasFace: boolean;
  captured: boolean;
}) {
  // Ellipse circumference ≈ 2π√((a²+b²)/2) for rx=110, ry=150
  const circumference = 816;

  const baseStroke = captured
    ? 'rgba(0,229,255,0.9)'
    : hasFace
    ? 'rgba(255,255,255,0.6)'
    : 'rgba(255,255,255,0.25)';

  return (
    <svg width="260" height="340" viewBox="0 0 260 340">
      <defs>
        <mask id="oval-mask">
          <rect width="260" height="340" fill="white" />
          <ellipse cx="130" cy="170" rx="110" ry="150" fill="black" />
        </mask>
      </defs>
      {/* Dim the outside of the oval */}
      <rect width="260" height="340" fill="rgba(0,0,0,0.35)" mask="url(#oval-mask)" />
      {/* Static oval border */}
      <ellipse
        cx="130" cy="170" rx="110" ry="150"
        fill="none"
        stroke={baseStroke}
        strokeWidth="2"
      />
      {/* Progress arc */}
      {progress > 0 && !captured && (
        <ellipse
          cx="130" cy="170" rx="110" ry="150"
          fill="none"
          stroke="rgba(0,229,255,0.95)"
          strokeWidth="3.5"
          strokeDasharray={`${progress * circumference} ${circumference}`}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '130px 170px' }}
        />
      )}
      {/* Full ring when captured */}
      {captured && (
        <ellipse
          cx="130" cy="170" rx="110" ry="150"
          fill="none"
          stroke="rgba(0,229,255,0.9)"
          strokeWidth="3.5"
        />
      )}
    </svg>
  );
}

export default Capture;
