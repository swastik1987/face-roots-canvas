/**
 * match-features — cosine similarity matching via pgvector.
 *
 * Input:  { analysis_id: string }
 * Output: { matches_written: number }
 *
 * For each feature_type the self has, computes the mean embedding across
 * all 3 angles, then finds the most similar family member embedding.
 * Writes top-1 winner + up to 4 runners-up into feature_matches.
 */
import { handleCors, jsonResponse, requireAuth } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { captureException } from '../_shared/sentry.ts';
import { MatchFeaturesInput } from '../_shared/schemas.ts';

const TOP_N = 5; // winner + 4 runners-up

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let userId = 'unknown';
  try {
    const user = await requireAuth(req);
    userId = user.id;

    const body = await req.json();
    const { analysis_id } = MatchFeaturesInput.parse(body);

    const db = getAdminClient();

    // Fetch the analysis and verify ownership
    const { data: analysis, error: analysisErr } = await db
      .from('analyses')
      .select('id, user_id, self_person_id')
      .eq('id', analysis_id)
      .single();

    if (analysisErr || !analysis) return jsonResponse({ error: 'Analysis not found' }, 404);
    if (analysis.user_id !== userId) return jsonResponse({ error: 'Forbidden' }, 403);

    // Get all family person IDs (not self)
    const { data: familyPersons } = await db
      .from('persons')
      .select('id')
      .eq('owner_user_id', userId)
      .eq('is_self', false);

    if (!familyPersons || familyPersons.length === 0) {
      return jsonResponse({ error: 'No family members with embeddings' }, 400);
    }

    const familyIds = familyPersons.map(p => p.id);

    // Get all feature types the self has embeddings for
    const { data: selfFeatureRows } = await db
      .from('feature_embeddings')
      .select('feature_type, embedding')
      .eq('person_id', analysis.self_person_id);

    if (!selfFeatureRows || selfFeatureRows.length === 0) {
      return jsonResponse({ error: 'No feature embeddings for self' }, 400);
    }

    // Group by feature_type → compute mean embedding per feature
    const featureMap = new Map<string, number[][]>();
    for (const row of selfFeatureRows) {
      const parsed = parseVector(row.embedding as string);
      if (!featureMap.has(row.feature_type)) featureMap.set(row.feature_type, []);
      featureMap.get(row.feature_type)!.push(parsed);
    }

    let matchesWritten = 0;

    for (const [featureType, embeddings] of featureMap) {
      const meanEmb = meanVector(embeddings);
      const meanStr = `[${meanEmb.join(',')}]`;

      // Use pgvector RPC to find top-N family members by cosine similarity
      const { data: matches, error: matchErr } = await db.rpc('match_feature_embeddings', {
        query_embedding: meanStr,
        feature_type_filter: featureType,
        family_person_ids: familyIds,
        match_count: TOP_N,
      });

      if (matchErr) {
        console.error(`[match-features] RPC error for ${featureType}:`, matchErr);
        continue;
      }

      if (!matches || matches.length === 0) continue;

      const winner = matches[0];
      const runnersUp = matches.slice(1).map((m: { person_id: string; similarity: number }) => ({
        person_id: m.person_id,
        similarity: m.similarity,
      }));

      // Compute confidence: 1 - std-dev of similarities across runners-up
      // (tight cluster = high confidence winner is correct)
      const allSims = matches.map((m: { similarity: number }) => m.similarity);
      const meanSim = allSims.reduce((a: number, b: number) => a + b, 0) / allSims.length;
      const variance =
        allSims.reduce((a: number, b: number) => a + Math.pow(b - meanSim, 2), 0) / allSims.length;
      const winnerConfidence = Math.max(0, 1 - Math.sqrt(variance));

      // Upsert feature_match row
      const { error: insertErr } = await db.from('feature_matches').upsert(
        {
          analysis_id,
          feature_type: featureType,
          winner_person_id: winner.person_id,
          winner_similarity: winner.similarity,
          winner_confidence: winnerConfidence,
          runners_up: runnersUp,
        },
        { onConflict: 'analysis_id,feature_type' },
      );

      if (insertErr) {
        console.error(`[match-features] insert error for ${featureType}:`, insertErr);
      } else {
        matchesWritten++;
      }
    }

    return jsonResponse({ matches_written: matchesWritten });
  } catch (err) {
    await captureException(err, { functionName: 'match-features', userId });
    const status = (err as Error & { status?: number }).status ?? 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});

/** Parse pgvector string "[0.1,0.2,...]" → number[] */
function parseVector(vec: string): number[] {
  return vec.replace(/^\[|\]$/g, '').split(',').map(Number);
}

/** Compute element-wise mean across a list of same-length vectors. */
function meanVector(vecs: number[][]): number[] {
  const dim = vecs[0].length;
  const sum = new Array(dim).fill(0);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  return sum.map(x => x / vecs.length);
}
