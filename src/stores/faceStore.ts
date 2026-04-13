/**
 * Zustand store for guided capture state.
 * Persists captured frame data (as object URLs) and landmark results
 * across the 3-angle flow until they are uploaded.
 */

import { create } from 'zustand';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type CaptureAngle = 'front' | 'left' | 'right';

export type CapturedFrame = {
  angle: CaptureAngle;
  imageDataUrl: string;           // createObjectURL of the captured blob
  blob: Blob;
  landmarkResult: FaceLandmarkerResult;
  blurScore: number;
  faceConfidence: number;
};

type FaceStore = {
  detectorReady: boolean;
  setDetectorReady: (ready: boolean) => void;

  frames: Partial<Record<CaptureAngle, CapturedFrame>>;
  addFrame: (frame: CapturedFrame) => void;
  clearFrames: () => void;
};

export const useFaceStore = create<FaceStore>((set) => ({
  detectorReady: false,
  setDetectorReady: (ready) => set({ detectorReady: ready }),

  frames: {},
  addFrame: (frame) =>
    set((state) => ({ frames: { ...state.frames, [frame.angle]: frame } })),
  clearFrames: () => set({ frames: {} }),
}));
