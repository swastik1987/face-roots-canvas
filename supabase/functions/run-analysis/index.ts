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
 * 1. Look up feature crops already uploaded by the client (Canvas API)
 * 2. Call embed-features (CLIP per-crop) — idempotent per crop
 *
 * Feature cropping is done client-side in the browser (Capture.tsx /
 * FamilyAdd.tsx) using the Canvas API. The crops are uploaded to the
 * `feature-crops` bucket under `{person_id}/{face_image_id}/`.
 * This function lists those crops and sends them to embed-features.
 *
 * NOTE: embed-face (holistic InsightFace embedding) is skipped because
 * face_embeddings are NOT used in the matching pipeline. match-features
 * queries feature_embeddings only (per-crop CLIP).
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
      // ── Step 1: check if feature embeddings already done ───────────────────
      const { count: existingCount } = await db
        .from('feature_embeddings')
        .select('*', { count: 'exact', head: true })
        .eq('face_image_id', image.id);

      if (existingCount && existingCount >= Object.keys(FEATURE_REGIONS).length) {
        // All feature embeddings already exist for this image — skip
        continue;
      }

      // ── Step 2: list existing feature crops from storage ───────────────────
      // Crops are uploaded client-side to: feature-crops/{userId}/{person_id}/{face_image_id}/
      // The userId prefix is required by the storage RLS policy.
      const cropPrefix = `${userId}/${person.id}/${image.id}`;
      let crops: Array<{ feature_type: string; storage_path: string }> = [];

      try {
        const { data: cropFiles, error: listErr } = await db.storage
          .from('feature-crops')
          .list(cropPrefix);

        if (listErr) {
          console.warn(`[run-analysis] Failed to list crops at ${cropPrefix}:`, listErr.message);
        }

        crops = (cropFiles ?? [])
          .filter(f => f.name.endsWith('.png'))
          .map(f => ({
            feature_type: f.name.replace('.png', ''),
            storage_path: `${cropPrefix}/${f.name}`,
          }));
      } catch (err) {
        console.warn(`[run-analysis] Error listing crops for ${image.id}:`, err);
      }

      if (crops.length === 0) {
        console.warn(`[run-analysis] No feature crops found for face_image ${image.id} — client may not have uploaded them. Skipping.`);
        continue;
      }

      console.log(`[run-analysis] Found ${crops.length} crops for face_image ${image.id}`);

      // ── Step 3: generate CLIP embeddings for each crop ─────────────────────
      try {
        await callFunction('embed-features', { face_image_id: image.id, crops }, userToken);
      } catch (err) {
        console.warn(`[run-analysis] embed-features failed for ${image.id}:`, err);
      }
    }
  }
}

/**
 * Call a sibling Edge Function using the original user's JWT so that
 * requireAuth() succeeds in the callee.
 *
 * Includes a 120-second timeout via AbortController to prevent the
 * pipeline from hanging indefinitely on a slow/stuck sub-function.
 */
async function callFunction(
  name: string,
  body: unknown,
  userToken: string,
  timeoutMs = 120_000,
): Promise<void> {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'no body');
      throw new Error(`Function ${name} failed (${res.status}): ${text}`);
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Function ${name} timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Deno Deploy / Supabase Edge Runtime global
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };
