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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let userId = 'unknown';
  try {
    const user = await requireAuth(req);
    userId = user.id;

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
      maxCalls: isPro ? 30 : 3,
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

    // Verify self has at least one front-angle image with embeddings
    const { count: selfEmbCount } = await db
      .from('feature_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('person_id', self_person_id);

    if (!selfEmbCount || selfEmbCount === 0) {
      return jsonResponse({ error: 'Self has no feature embeddings. Complete capture first.' }, 400);
    }

    // Verify at least one family member has embeddings
    const { data: familyPersons } = await db
      .from('persons')
      .select('id')
      .eq('owner_user_id', userId)
      .eq('is_self', false);

    if (!familyPersons || familyPersons.length === 0) {
      return jsonResponse({ error: 'No family members added.' }, 400);
    }

    const familyIds = familyPersons.map(p => p.id);
    const { count: familyEmbCount } = await db
      .from('feature_embeddings')
      .select('*', { count: 'exact', head: true })
      .in('person_id', familyIds);

    if (!familyEmbCount || familyEmbCount === 0) {
      return jsonResponse({ error: 'No family members have embeddings yet.' }, 400);
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
      runPipeline(analysisId, userId, self_person_id, db),
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
  selfPersonId: string,
  db: ReturnType<typeof getAdminClient>,
) {
  const setStatus = (status: string, errorMessage?: string) =>
    db.from('analyses').update({
      status,
      ...(errorMessage ? { error_message: errorMessage } : {}),
      ...(status === 'done' ? { completed_at: new Date().toISOString(), model_versions: MODEL_VERSIONS } : {}),
    }).eq('id', analysisId);

  try {
    // ── Stage: matching ───────────────────────────────────────────────────────
    await setStatus('matching');

    // Call match-features function internally via HTTP
    await callFunction('match-features', { analysis_id: analysisId }, userId);

    // ── Stage: narrating ─────────────────────────────────────────────────────
    await setStatus('narrating');

    // Check if narrate-matches function exists (Phase 4), call if available
    try {
      await callFunction('narrate-matches', { analysis_id: analysisId }, userId);
    } catch {
      // narrate-matches ships in Phase 4 — skip gracefully
      console.warn('[run-analysis] narrate-matches not available yet, skipping');
    }

    // ── Stage: done ───────────────────────────────────────────────────────────
    await setStatus('done');
  } catch (err) {
    console.error('[run-analysis] pipeline error:', err);
    await captureException(err, { functionName: 'run-analysis/pipeline', userId });
    await setStatus('failed', (err as Error).message);
  }
}

/** Call a sibling Edge Function via its HTTP URL using the service-role key. */
async function callFunction(name: string, body: unknown, _userId: string): Promise<void> {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Use service role key so sibling functions trust this call
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
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
