/**
 * Client-side feature cropping + upload to Supabase Storage.
 *
 * Called after capturing/uploading a face image, this uses the browser
 * Canvas API (which works everywhere — unlike OffscreenCanvas in Deno)
 * to crop each facial feature region and upload the crops to the
 * `feature-crops` bucket so that run-analysis can find them server-side.
 *
 * Storage path: {userId}/{personId}/{faceImageId}/{featureType}.png
 * The userId prefix is required by the bucket's RLS policy.
 */

import { supabase } from '@/lib/supabase';
import { cropFeatures } from './cropper';
import { FRONT_FEATURES, SIDE_FEATURES, type FeatureType } from './regions';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

/**
 * Crop all detectable features from a face image and upload them to the
 * feature-crops bucket in Supabase Storage.
 *
 * @param personId     The person this image belongs to
 * @param faceImageId  The face_images row ID (used as folder name in storage)
 * @param source       The source image element (must be already loaded)
 * @param landmarkResult  MediaPipe detection result with faceLandmarks
 * @param angle        Which angle was captured (determines which features to crop)
 * @returns Array of successfully uploaded crop descriptors
 */
export async function cropAndUploadFeatures(
  personId: string,
  faceImageId: string,
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  landmarkResult: FaceLandmarkerResult,
  angle: 'front' | 'left' | 'right' | 'unknown' = 'front',
): Promise<Array<{ feature_type: string; storage_path: string }>> {
  // Get current user ID — needed for storage path (RLS requires uid as first segment)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[uploadCrops] No authenticated user — cannot upload crops');
    return [];
  }

  // Determine which features to crop based on angle
  const features: FeatureType[] = [...FRONT_FEATURES];
  if (angle === 'left') features.push('ear_left');
  if (angle === 'right') features.push('ear_right');

  let crops;
  try {
    crops = await cropFeatures(landmarkResult, source, features);
  } catch (err) {
    console.warn('[uploadCrops] cropFeatures failed:', err);
    return [];
  }

  if (!crops.length) {
    console.warn('[uploadCrops] No crops produced');
    return [];
  }

  const uploaded: Array<{ feature_type: string; storage_path: string }> = [];

  // Upload each crop in parallel (they're small PNGs)
  // Path: {userId}/{personId}/{faceImageId}/{featureType}.png
  // The RLS policy requires auth.uid() as the first path segment.
  const uploadPromises = crops.map(async (crop) => {
    const cropPath = `${user.id}/${personId}/${faceImageId}/${crop.featureType}.png`;

    try {
      const { error } = await supabase.storage
        .from('feature-crops')
        .upload(cropPath, crop.blob, { contentType: 'image/png', upsert: true });

      if (error) {
        console.warn(`[uploadCrops] Upload failed for ${cropPath}:`, error.message);
        return null;
      }

      return { feature_type: crop.featureType, storage_path: cropPath };
    } catch (err) {
      console.warn(`[uploadCrops] Upload error for ${cropPath}:`, err);
      return null;
    }
  });

  const results = await Promise.all(uploadPromises);
  for (const r of results) {
    if (r) uploaded.push(r);
  }

  console.log(`[uploadCrops] Uploaded ${uploaded.length}/${crops.length} feature crops`);
  return uploaded;
}

/**
 * Helper: create an HTMLImageElement from a Blob or data URL and wait
 * for it to load. Useful for converting webcam screenshots or uploaded
 * files into a source suitable for cropFeatures().
 */
export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image from blob'));
    };
    img.src = url;
  });
}

export function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image from data URL'));
    img.src = dataUrl;
  });
}
