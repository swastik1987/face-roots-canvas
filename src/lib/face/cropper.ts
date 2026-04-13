/**
 * Feature cropper.
 *
 * Given a set of MediaPipe 478 landmarks and a source image/canvas,
 * produces a 224×224 PNG Blob for each requested feature region.
 *
 * Usage:
 *   const crops = await cropFeatures(landmarks, imageElement, ['eyes_left', 'nose']);
 */

import { FACE_REGIONS, CROP_SIZE, CROP_PAD, type FeatureType } from './regions';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type CropResult = {
  featureType: FeatureType;
  blob: Blob;
  /** Laplacian variance (sharpness estimate). Higher = sharper. */
  blurScore: number;
};

type Point2D = { x: number; y: number };

/**
 * Crop all requested features from a source image.
 *
 * @param result   FaceLandmarkerResult (must contain at least one face)
 * @param source   The original image element the landmarks were detected on
 * @param features Which feature types to crop (defaults to all non-side features)
 */
export async function cropFeatures(
  result: FaceLandmarkerResult,
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  features: FeatureType[],
): Promise<CropResult[]> {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return [];

  const landmarks = result.faceLandmarks[0];
  const w = 'naturalWidth' in source ? source.naturalWidth : ('videoWidth' in source ? source.videoWidth : source.width);
  const h = 'naturalHeight' in source ? source.naturalHeight : ('videoHeight' in source ? source.videoHeight : source.height);

  const results: CropResult[] = [];

  for (const featureType of features) {
    const indices = FACE_REGIONS[featureType];
    if (indices === 'convex_hull') {
      // face_shape: crop full face bounding box
      const pts = landmarks.map(lm => ({ x: lm.x * w, y: lm.y * h }));
      const blob = await cropRegionToBlob(source, boundingBox(pts), w, h);
      if (blob) results.push({ featureType, blob, blurScore: await laplacianVariance(blob) });
    } else {
      const pts = indices.map(i => ({ x: landmarks[i].x * w, y: landmarks[i].y * h }));
      const blob = await cropRegionToBlob(source, boundingBox(pts), w, h);
      if (blob) results.push({ featureType, blob, blurScore: await laplacianVariance(blob) });
    }
  }

  return results;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type BBox = { x: number; y: number; w: number; h: number };

function boundingBox(pts: Point2D[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

async function cropRegionToBlob(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  box: BBox,
  imgW: number,
  imgH: number,
): Promise<Blob | null> {
  // Add padding
  const pad = Math.max(box.w, box.h) * CROP_PAD;
  const sx = Math.max(0, box.x - pad);
  const sy = Math.max(0, box.y - pad);
  const sw = Math.min(imgW - sx, box.w + pad * 2);
  const sh = Math.min(imgH - sy, box.h + pad * 2);

  if (sw <= 0 || sh <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = CROP_SIZE;
  canvas.height = CROP_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, CROP_SIZE, CROP_SIZE);

  return new Promise<Blob | null>(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

/**
 * Estimate image sharpness via Laplacian variance.
 * Higher values = sharper. Threshold in CLAUDE.md is ≥ 100.
 */
async function laplacianVariance(blob: Blob): Promise<number> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    let sum = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        // Grayscale Laplacian: -4*center + top + bottom + left + right
        const g = (r: number) => 0.299 * data[r] + 0.587 * data[r + 1] + 0.114 * data[r + 2];
        const lap =
          -4 * g(i) +
          g((y - 1) * width * 4 + x * 4) +
          g((y + 1) * width * 4 + x * 4) +
          g(y * width * 4 + (x - 1) * 4) +
          g(y * width * 4 + (x + 1) * 4);
        sum += lap * lap;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  } catch {
    return 0;
  }
}
