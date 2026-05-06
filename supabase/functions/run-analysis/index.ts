/**
 * run-analysis — orchestrator for the full FaceBlame ML pipeline.
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
import { captureException } from '../_shared/sentry.ts';
import { RunAnalysisInput, parseJsonBody } from '../_shared/schemas.ts';
import { MODEL_VERSIONS } from '../_shared/models.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let userId = 'unknown';
  try {
    const user = await requireAuth(req);
    userId = user.id;

    // Capture the user's JWT so sibling functions can authenticate as this user
    const userToken = req.headers.get('Authorization')!.replace('Bearer ', '');

    const { self_person_id } = await parseJsonBody(req, RunAnalysisInput);

    const db = getAdminClient();

    // ── Consent pre-check ────────────────────────────────────────────────────
    // DPDP / GDPR: refuse to process embeddings unless the user has actively
    // granted the `embeddings` scope and hasn't revoked consent since.
    const { data: latestConsent, error: consentErr } = await db
      .from('consent_events')
      .select('event_type, scopes, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (consentErr) {
      throw new Error(`Consent check failed: ${consentErr.message}`);
    }
    if (!latestConsent) {
      return jsonResponse(
        { error: 'Consent has not been granted. Please review the consent screen.' },
        403,
      );
    }
    if (latestConsent.event_type === 'revoked') {
      return jsonResponse(
        { error: 'Consent has been revoked. Please re-grant consent to run an analysis.' },
        403,
      );
    }
    const scopes = (latestConsent.scopes ?? {}) as Record<string, unknown>;
    if (scopes.embeddings !== true) {
      return jsonResponse(
        { error: 'The "embeddings" consent scope is required to run an analysis.' },
        403,
      );
    }

    // TODO: re-enable rate limiting (3/day free, 30/day pro) via checkRateLimit
    // from ../_shared/rateLimit.ts once ready for production traffic.


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
    // Embeddings are now generated client-side using Transformers.js (CLIP
    // ViT-B/32) before the analysis is triggered. The client calls
    // ensureAllCropsUploaded() which crops features and generates embeddings
    // in the browser, inserting them directly into feature_embeddings.
    // We just verify they exist — no server-side embedding needed.
    await setStatus('embedding');

    // Verify self has feature embeddings before proceeding. The client is
    // responsible for generating + inserting them before calling us; if none
    // exist here, surface a clear reason based on which upstream step failed.
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
