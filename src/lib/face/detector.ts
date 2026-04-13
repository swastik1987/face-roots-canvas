/**
 * FaceLandmarker singleton.
 *
 * Loads the MediaPipe FaceLandmarker model once (from CDN) and caches
 * it in module scope. Call initDetector() at app boot; subsequent
 * calls return immediately.
 *
 * Usage:
 *   await initDetector();
 *   const result = await detectFace(imageElement);
 */

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';

let landmarker: FaceLandmarker | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialise the FaceLandmarker. Safe to call multiple times — only
 * creates one instance. Awaiting this at app boot avoids cold-start
 * latency on first capture.
 */
export async function initDetector(): Promise<void> {
  if (landmarker) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });
  })();

  return initPromise;
}

/**
 * Switch running mode (IMAGE for uploads, VIDEO for live camera).
 * Must be called before each modality change.
 */
export async function setRunningMode(mode: 'IMAGE' | 'VIDEO'): Promise<void> {
  if (!landmarker) await initDetector();
  await landmarker!.setOptions({ runningMode: mode });
}

/**
 * Run face detection on a static image element.
 */
export function detectImage(
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap,
): FaceLandmarkerResult {
  if (!landmarker) throw new Error('FaceLandmarker not initialised. Call initDetector() first.');
  return landmarker.detect(source);
}

/**
 * Run face detection on a single video frame (for live capture).
 * @param timestampMs Current video timestamp in ms.
 */
export function detectVideoFrame(
  video: HTMLVideoElement,
  timestampMs: number,
): FaceLandmarkerResult {
  if (!landmarker) throw new Error('FaceLandmarker not initialised. Call initDetector() first.');
  return landmarker.detectForVideo(video, timestampMs);
}

/** True once the model is loaded and ready. */
export function isDetectorReady(): boolean {
  return landmarker !== null;
}
