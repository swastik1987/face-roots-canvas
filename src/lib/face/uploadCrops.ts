/**
 * Client-side feature cropping, embedding, and upload.
 *
 * Called after capturing/uploading a face image, this uses the browser
 * Canvas API to crop each facial feature region, generates CLIP embeddings
 * client-side via Transformers.js (no API calls), uploads the crops to
 * the `feature-crops` bucket, and inserts embeddings directly into the
 * `feature_embeddings` table.
 *
 * Storage path: {userId}/{personId}/{faceImageId}/{featureType}.png
 * The userId prefix is required by the bucket's RLS policy.
 */

import { supabase } from '@/lib/supabase';
import { cropFeatures } from './cropper';
import { FRONT_FEATURES, SIDE_FEATURES, type FeatureType } from './regions';
import { embedImage, CLIP_MODEL_VERSION, EMBEDDING_DIM } from './embedder';
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

/**
 * Pre-analysis backfill: ensure every face image owned by the current user
 * has feature embeddings. Uses stored landmarks from the DB + Canvas API
 * to generate crops client-side, uploads them, then calls embed-features
 * to generate CLIP embeddings — all before run-analysis starts.
 *
 * This means run-analysis finds existing embeddings and skips crop listing,
 * making it immune to any path mismatch between client and server.
 *
 * @param onProgress  Optional callback for UI feedback
 * @returns Number of images that had embeddings generated
 */
export async function ensureAllCropsUploaded(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[backfill] No authenticated user');
    return 0;
  }

  // Fetch all this user's persons
  const { data: persons } = await supabase
    .from('persons')
    .select('id')
    .eq('owner_user_id', user.id);

  if (!persons?.length) return 0;

  // Fetch all face images
  const personIds = persons.map(p => p.id);
  const { data: images } = await supabase
    .from('face_images')
    .select('id, person_id, storage_path, angle')
    .in('person_id', personIds);

  if (!images?.length) return 0;

  let processed = 0;
  const total = images.length;

  for (const img of images) {
    onProgress?.(processed, total);

    // Check if this image already has enough embeddings in DB
    const { count: embCount } = await supabase
      .from('feature_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('face_image_id', img.id);

    if (embCount && embCount >= 8) {
      // Already has embeddings — skip entirely
      processed++;
      continue;
    }

    // Check if crops exist in storage
    const cropPrefix = `${user.id}/${img.person_id}/${img.id}`;
    const { data: existing } = await supabase.storage
      .from('feature-crops')
      .list(cropPrefix);

    const existingPngs = (existing ?? []).filter(f => f.name.endsWith('.png'));
    let uploadedCrops: Array<{ feature_type: string; storage_path: string }> = [];

    if (existingPngs.length >= 8) {
      // Crops exist but embeddings don't — build crop list from storage
      uploadedCrops = existingPngs.map(f => ({
        feature_type: f.name.replace('.png', ''),
        storage_path: `${cropPrefix}/${f.name}`,
      }));
    } else {
      // Need to generate crops from landmarks
      const { data: lmRow } = await supabase
        .from('face_landmarks')
        .select('landmarks_json')
        .eq('face_image_id', img.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lmRow?.landmarks_json) {
        console.warn(`[backfill] No landmarks for image ${img.id} — skipping`);
        processed++;
        continue;
      }

      const stored = lmRow.landmarks_json as {
        landmarks?: Array<{ x: number; y: number; z?: number; visibility?: number }>;
      };

      if (!stored.landmarks?.length) {
        console.warn(`[backfill] Empty landmarks for image ${img.id}`);
        processed++;
        continue;
      }

      // Download the face image from storage
      const { data: signedData } = await supabase.storage
        .from('face-images-raw')
        .createSignedUrl(img.storage_path, 300);

      if (!signedData?.signedUrl) {
        console.warn(`[backfill] No signed URL for image ${img.id}`);
        processed++;
        continue;
      }

      let imgEl: HTMLImageElement;
      try {
        imgEl = await loadImageFromSignedUrl(signedData.signedUrl);
      } catch {
        console.warn(`[backfill] Failed to load image ${img.id}`);
        processed++;
        continue;
      }

      // Reconstruct FaceLandmarkerResult from stored landmarks
      const mockResult: FaceLandmarkerResult = {
        faceLandmarks: [stored.landmarks.map(lm => ({
          x: lm.x,
          y: lm.y,
          z: lm.z ?? 0,
          visibility: lm.visibility ?? 0,
        }))],
        faceBlendshapes: [],
        facialTransformationMatrixes: [],
      };

      const angle = (img.angle as 'front' | 'left' | 'right') || 'front';

      try {
        uploadedCrops = await cropAndUploadFeatures(
          img.person_id,
          img.id,
          imgEl,
          mockResult,
          angle,
        );
        console.log(`[backfill] Image ${img.id}: uploaded ${uploadedCrops.length} crops`);
      } catch (err) {
        console.warn(`[backfill] Crop failed for image ${img.id}:`, err);
        processed++;
        continue;
      }
    }

    // Generate CLIP embeddings client-side using Transformers.js (no API needed)
    // and insert directly into feature_embeddings table.
    if (uploadedCrops.length > 0) {
      let embeddedCount = 0;

      for (const crop of uploadedCrops) {
        try {
          // Check if this specific embedding already exists
          const { data: existingEmb } = await supabase
            .from('feature_embeddings')
            .select('id')
            .eq('face_image_id', img.id)
            .eq('feature_type', crop.feature_type)
            .maybeSingle();

          if (existingEmb) {
            embeddedCount++;
            continue; // idempotent — skip if already done
          }

          // Download the crop from storage to get the blob
          const { data: cropBlob } = await supabase.storage
            .from('feature-crops')
            .download(crop.storage_path);

          if (!cropBlob) {
            console.warn(`[backfill] Could not download crop ${crop.storage_path}`);
            continue;
          }

          // Generate CLIP embedding client-side
          const embedding = await embedImage(cropBlob);

          // Insert directly into feature_embeddings
          const { error: insertErr } = await supabase
            .from('feature_embeddings')
            .insert({
              person_id: img.person_id,
              face_image_id: img.id,
              feature_type: crop.feature_type,
              crop_storage_path: crop.storage_path,
              embedding: `[${embedding.join(',')}]`,
              model_version: CLIP_MODEL_VERSION,
            });

          if (insertErr) {
            console.warn(`[backfill] Insert failed for ${crop.feature_type}:`, insertErr.message);
          } else {
            embeddedCount++;
          }
        } catch (err) {
          console.warn(`[backfill] Embedding failed for ${crop.feature_type}:`, err);
        }
      }

      console.log(`[backfill] Image ${img.id}: embedded ${embeddedCount}/${uploadedCrops.length} features`);
    }

    processed++;
  }

  onProgress?.(processed, total);
  console.log(`[backfill] Done: processed ${processed}/${total} images`);
  return processed;
}

/** Load an image from a signed URL (cross-origin safe). */
function loadImageFromSignedUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // needed for Canvas to read pixels
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image from URL'));
    img.src = url;
  });
}
