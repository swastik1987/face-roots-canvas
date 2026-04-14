/**
 * run-analysis — orchestrator for the full FaceRoots ML pipeline.
 *
 * Input:  { self_person_id: string }
 * Output: { analysis_id: string }
 *
 * The client should subscribe to Supabase Realtime on the analyses table
 * (filter: id=eq.<analysis_id>) to get live status updates.
 *
 * Pipeline stages (each updates analyses.status):
 *   pending → embedding → matching → narrating → rendering → done
 *   Any failure → failed (with error_message)
 *
 * Rate limit: 3 analyses/day for free plan, 30 for pro.
 */
import { handleCors, jsonResponse, requireAuth } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { captureException } from '../_shared/sentry.ts';
import { RunAnalysisInput } from '../_shared/schemas.ts';
import { MODEL_VERSIONS } from '../_shared/models.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// Feature regions: MediaPipe FaceMesh landmark indices (478-point model).
// Excludes 'face_shape' (convex hull — not a fixed index list) and
// 'ear_left'/'ear_right' (only reliable in profile shots).
const FEATURE_REGIONS: Record<string, number[]> = {
  eyes_left:      [33, 133, 157, 158, 159, 160, 161, 173, 246, 7, 163, 144, 145, 153, 154, 155],
  eyes_right:     [362, 263, 384, 385, 386, 387, 388, 398, 466, 249, 390, 373, 374, 380, 381, 382],
  nose:           [1, 2, 5, 4, 6, 19, 94, 168, 197, 195, 45, 275],
  mouth:          [61, 291, 78, 308, 13, 14, 17, 0, 37, 267, 269, 270, 409],
  jawline:        [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
  forehead:       [10, 67, 109, 108, 151, 337, 338, 297, 299],
  eyebrows_left:  [46, 53, 52, 65, 55, 70, 63, 105, 66, 107],
  eyebrows_right: [276, 283, 282, 295, 285, 300, 293, 334, 296, 336],
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let userId = 'unknown';
  try {
    const user = await requireAuth(req);
    userId = user.id;

    // Capture the user's JWT so sibling functions can authenticate as this user
    const userToken = req.headers.get('Authorization')!.replace('Bearer ', '');

    const body = await req.json();
    const { self_person_id } = RunAnalysisInput.parse(body);

    const db = getAdminClient();

    // Fetch profile to determine rate limit tier
    const { data: profile } = await db
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .single();

    const isPro = profile?.plan === 'pro';
    await checkRateLimit({
      userId,
      action: 'run_analysis',
      windowSecs: 86400,
      maxCalls: isPro ? 30 : 10,
    });

    // Verify self_person_id belongs to this user and is_self
    const { data: selfPerson, error: personErr } = await db
      .from('persons')
      .select('id, is_self, owner_user_id')
      .eq('id', self_person_id)
      .single();

    if (personErr || !selfPerson) return jsonResponse({ error: 'Self person not found' }, 404);
    if (selfPerson.owner_user_id !== userId) return jsonResponse({ error: 'Forbidden' }, 403);
    if (!selfPerson.is_self) return jsonResponse({ error: 'person is not marked as self' }, 400);

    // Verify self has at least one face image
    const { count: selfImageCount } = await db
      .from('face_images')
      .select('*', { count: 'exact', head: true })
      .eq('person_id', self_person_id);

    if (!selfImageCount || selfImageCount === 0) {
      return jsonResponse({ error: 'No face images found. Complete capture first.' }, 400);
    }

    // Verify at least one family member exists with a face image
    const { data: familyPersons } = await db
      .from('persons')
      .select('id')
      .eq('owner_user_id', userId)
      .eq('is_self', false);

    if (!familyPersons || familyPersons.length === 0) {
      return jsonResponse({ error: 'No family members added.' }, 400);
    }

    const familyIds = familyPersons.map(p => p.id);
    const { count: familyImageCount } = await db
      .from('face_images')
      .select('*', { count: 'exact', head: true })
      .in('person_id', familyIds);

    if (!familyImageCount || familyImageCount === 0) {
      return jsonResponse({ error: 'No family member photos found. Add photos first.' }, 400);
    }

    // Create analysis row
    const { data: analysis, error: createErr } = await db
      .from('analyses')
      .insert({
        user_id: userId,
        self_person_id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (createErr || !analysis) throw new Error(`Failed to create analysis: ${createErr?.message}`);

    const analysisId = analysis.id;

    // Run pipeline in background (don't await — respond immediately)
    EdgeRuntime.waitUntil(
      runPipeline(analysisId, userId, userToken, db),
    );

    return jsonResponse({ analysis_id: analysisId });
  } catch (err) {
    await captureException(err, { functionName: 'run-analysis', userId });
    const status = (err as Error & { status?: number }).status ?? 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});

async function runPipeline(
  analysisId: string,
  userId: string,
  userToken: string,
  db: ReturnType<typeof getAdminClient>,
) {
  const setStatus = (status: string, errorMessage?: string) =>
    db.from('analyses').update({
      status,
      ...(errorMessage ? { error_message: errorMessage } : {}),
      ...(status === 'done' ? { completed_at: new Date().toISOString(), model_versions: MODEL_VERSIONS } : {}),
    }).eq('id', analysisId);

  try {
    // ── Stage: embedding ──────────────────────────────────────────────────────
    // Generate face + feature embeddings for all persons. Idempotent — skips
    // any person/image that already has embeddings.
    await setStatus('embedding');
    await embedAllPersons(userId, userToken, db);

    // Verify self has feature embeddings before proceeding — embedAllPersons
    // catches errors per-image to avoid one bad image blocking everything,
    // but if ALL images failed we need to stop here with a clear message.
    const { data: analysisRow } = await db
      .from('analyses')
      .select('self_person_id')
      .eq('id', analysisId)
      .single();

    const { count: selfEmbeddingCount } = await db
      .from('feature_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('person_id', analysisRow!.self_person_id);

    if (!selfEmbeddingCount || selfEmbeddingCount === 0) {
      // Check what went wrong to give a useful error
      const { data: selfImages } = await db
        .from('face_images')
        .select('id')
        .eq('person_id', analysisRow!.self_person_id);

      const imageIds = selfImages?.map(i => i.id) ?? [];
      let reason = 'No face images found for self.';

      if (imageIds.length > 0) {
        const { count: landmarkCount } = await db
          .from('face_landmarks')
          .select('*', { count: 'exact', head: true })
          .in('face_image_id', imageIds);

        if (!landmarkCount || landmarkCount === 0) {
          reason = 'Face landmarks are missing — please re-capture your photo.';
        } else {
          reason = 'Feature crops or embeddings could not be generated — please try re-capturing your photo.';
        }
      }

      throw new Error(reason);
    }

    // Also verify at least one family member has embeddings
    const { data: familyPersons } = await db
      .from('persons')
      .select('id')
      .eq('owner_user_id', userId)
      .eq('is_self', false);

    if (familyPersons && familyPersons.length > 0) {
      const familyIds = familyPersons.map(p => p.id);
      const { count: familyEmbeddingCount } = await db
        .from('feature_embeddings')
        .select('*', { count: 'exact', head: true })
        .in('person_id', familyIds);

      if (!familyEmbeddingCount || familyEmbeddingCount === 0) {
        throw new Error('Feature embeddings could not be generated for your family members — please re-upload their photos.');
      }
    }

    // ── Stage: matching ───────────────────────────────────────────────────────
    await setStatus('matching');
    await callFunction('match-features', { analysis_id: analysisId }, userToken);

    // ── Stage: narrating ─────────────────────────────────────────────────────
    await setStatus('narrating');
    await callFunction('narrate-matches', { analysis_id: analysisId }, userToken);

    // ── Stage: rendering ─────────────────────────────────────────────────────
    await setStatus('rendering');
    try {
      await callFunction('render-legacy-card', { analysis_id: analysisId }, userToken);
    } catch (renderErr) {
      // Rendering failure is non-fatal: the card can be re-rendered on demand
      // from the Share page. Log and continue to mark the analysis as done.
      console.warn('[run-analysis] render-legacy-card failed (non-fatal):', renderErr);
    }

    // ── Stage: done ───────────────────────────────────────────────────────────
    await setStatus('done');
  } catch (err) {
    console.error('[run-analysis] pipeline error:', err);
    await captureException(err, { functionName: 'run-analysis/pipeline', userId });
    await setStatus('failed', (err as Error).message);
  }
}

/**
 * For every person owned by this user, for every face image:
 * 1. Call embed-face (holistic InsightFace embedding) — idempotent
 * 2. Crop feature regions using OffscreenCanvas + landmarks
 * 3. Upload crops to feature-crops bucket
 * 4. Call embed-features (DINOv2 per-crop) — idempotent per crop
 */
async function embedAllPersons(
  userId: string,
  userToken: string,
  db: ReturnType<typeof getAdminClient>,
) {
  const { data: persons } = await db
    .from('persons')
    .select('id')
    .eq('owner_user_id', userId);

  if (!persons?.length) return;

  for (const person of persons) {
    const { data: images } = await db
      .from('face_images')
      .select('id, storage_path')
      .eq('person_id', person.id);

    if (!images?.length) continue;

    for (const image of images) {
      // ── Step 1: holistic face embedding (InsightFace, idempotent) ──────────
      try {
        await callFunction('embed-face', { face_image_id: image.id }, userToken);
      } catch (err) {
        console.warn(`[run-analysis] embed-face failed for ${image.id}:`, err);
      }

      // ── Step 2: check if feature embeddings already done ───────────────────
      const { count: existingCount } = await db
        .from('feature_embeddings')
        .select('*', { count: 'exact', head: true })
        .eq('face_image_id', image.id);

      if (existingCount && existingCount >= Object.keys(FEATURE_REGIONS).length) {
        // All feature embeddings already exist for this image — skip
        continue;
      }

      // ── Step 3: get landmarks ──────────────────────────────────────────────
      const { data: landmarkRow } = await db
        .from('face_landmarks')
        .select('landmarks_json')
        .eq('face_image_id', image.id)
        .maybeSingle();

      if (!landmarkRow) {
        console.warn(`[run-analysis] no landmarks for face_image ${image.id} — skipping feature crop`);
        continue;
      }

      // ── Step 4: crop features server-side and upload ───────────────────────
      let crops: Array<{ feature_type: string; storage_path: string }> = [];
      try {
        crops = await cropAndUploadFeatures(
          image.id,
          image.storage_path,
          landmarkRow.landmarks_json,
          person.id,
          db,
        );
      } catch (err) {
        console.warn(`[run-analysis] feature crop failed for ${image.id}:`, err);
      }

      if (crops.length === 0) continue;

      // ── Step 5: generate DINOv2 embeddings for each crop ──────────────────
      try {
        await callFunction('embed-features', { face_image_id: image.id, crops }, userToken);
      } catch (err) {
        console.warn(`[run-analysis] embed-features failed for ${image.id}:`, err);
      }
    }
  }
}

/**
 * Download a face image from storage, extract landmark coordinates, crop each
 * feature region using OffscreenCanvas, and upload the crops to the
 * `feature-crops` bucket.
 *
 * Returns the list of { feature_type, storage_path } for successfully uploaded
 * crops, so the caller can pass them straight to embed-features.
 *
 * Requires Deno 1.37+ (OffscreenCanvas + createImageBitmap).
 */
async function cropAndUploadFeatures(
  faceImageId: string,
  storagePath: string,
  landmarksJson: unknown,
  personId: string,
  db: ReturnType<typeof getAdminClient>,
): Promise<Array<{ feature_type: string; storage_path: string }>> {
  // Download the source image
  const { data: imageBlob, error: dlErr } = await db.storage
    .from('face-images-raw')
    .download(storagePath);

  if (dlErr || !imageBlob) {
    throw new Error(`Failed to download face image ${storagePath}: ${dlErr?.message}`);
  }

  // Normalise landmarks: FamilyAdd stores { landmarks, matrix, bbox }
  // Capture may store the same or a bare array.
  let landmarks: Array<{ x: number; y: number; z: number }>;
  if (Array.isArray(landmarksJson)) {
    landmarks = landmarksJson as Array<{ x: number; y: number; z: number }>;
  } else if (landmarksJson && typeof landmarksJson === 'object' && 'landmarks' in (landmarksJson as object)) {
    landmarks = (landmarksJson as { landmarks: Array<{ x: number; y: number; z: number }> }).landmarks;
  } else {
    throw new Error('Unrecognised landmarks_json format');
  }

  if (!landmarks?.length) throw new Error('Empty landmarks array');

  // Decode image → ImageBitmap
  const imageBitmap = await createImageBitmap(imageBlob);
  const { width, height } = imageBitmap;

  const crops: Array<{ feature_type: string; storage_path: string }> = [];

  try {
    for (const [featureType, indices] of Object.entries(FEATURE_REGIONS)) {
      // Validate indices are within bounds
      const validIndices = indices.filter(i => i < landmarks.length);
      if (validIndices.length < 2) continue;

      // Convert normalised landmark coords → pixel space
      const xs = validIndices.map(i => landmarks[i].x * width);
      const ys = validIndices.map(i => landmarks[i].y * height);

      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const bw = maxX - minX;
      const bh = maxY - minY;
      if (bw < 4 || bh < 4) continue; // degenerate — skip

      // 15% padding on each side (from CLAUDE.md §6.2)
      const pad = 0.15;
      const sx = Math.max(0, minX - bw * pad);
      const sy = Math.max(0, minY - bh * pad);
      const sw = Math.min(width - sx, bw * (1 + 2 * pad));
      const sh = Math.min(height - sy, bh * (1 + 2 * pad));

      if (sw < 4 || sh < 4) continue;

      // Draw crop to 224×224 OffscreenCanvas
      const canvas = new OffscreenCanvas(224, 224);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imageBitmap, sx, sy, sw, sh, 0, 0, 224, 224);
      const cropBlob = await canvas.convertToBlob({ type: 'image/png' });

      // Upload to feature-crops bucket
      const cropPath = `${personId}/${faceImageId}/${featureType}.png`;
      const { error: upErr } = await db.storage
        .from('feature-crops')
        .upload(cropPath, cropBlob, { contentType: 'image/png', upsert: true });

      if (upErr) {
        console.warn(`[run-analysis] failed to upload crop ${cropPath}:`, upErr.message);
        continue;
      }

      crops.push({ feature_type: featureType, storage_path: cropPath });
    }
  } finally {
    imageBitmap.close();
  }

  return crops;
}

/**
 * Call a sibling Edge Function using the original user's JWT so that
 * requireAuth() succeeds in the callee.
 */
async function callFunction(name: string, body: unknown, userToken: string): Promise<void> {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'no body');
    throw new Error(`Function ${name} failed (${res.status}): ${text}`);
  }
}

// Deno Deploy / Supabase Edge Runtime global
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };
