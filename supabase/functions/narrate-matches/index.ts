/**
 * narrate-matches — generate playful Gemini 2.5 Flash Vision captions
 * for each feature match in an analysis.
 *
 * Input:  { analysis_id: string }
 * Output: { narrated: number }
 *
 * For each feature_match without an llm_verdict:
 *   1. Fetch self's crop + winner's crop from storage (signed URLs → base64)
 *   2. Check verdict_cache (keyed by sha256 of both paths + feature_type)
 *   3. Cache miss → call Gemini 2.5 Flash with locked system prompt
 *   4. Apply deny-list post-filter; fall back to template if triggered
 *   5. Write verdict to feature_matches + verdict_cache
 */
import { handleCors, jsonResponse, requireAuth } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { captureException } from '../_shared/sentry.ts';
import { MatchFeaturesInput } from '../_shared/schemas.ts';
import { MODEL_VERSIONS } from '../_shared/models.ts';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// §9.1 Locked system prompt — NEVER edit without product + legal sign-off
const SYSTEM_PROMPT = `You are writing playful, warm, one-line captions for a fun consumer app
that compares facial features between family members.

Rules you MUST follow:
- Write exactly one sentence, max 15 words.
- Be warm, light, a little witty. Never sarcastic or mean.
- Refer to the feature by name (eyes, nose, mouth, jawline, etc).
- You may use at most one emoji. None is also fine.
- NEVER comment on: attractiveness, beauty, ugliness, health, weight,
  age, emotion, mood, ethnicity, race, skin tone, or perceived gender.
- NEVER claim genetic, biological, or hereditary relationship. This is
  a visual resemblance game, not a DNA test.
- If the two crops look clearly different, say so honestly but kindly
  ("not quite a match on this one").
- Output ONLY the sentence. No preamble, no quotes, no markdown.`;

// §9.3 Guardrail deny-list
const DENY_LIST =
  /beautiful|ugly|pretty|handsome|attractive|dna|gene|genetic|hereditary|blood|ethnic|race|old|young|sick|healthy|fat|thin/i;

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
    const apiKey = Deno.env.get('GOOGLE_AI_STUDIO_KEY');
    if (!apiKey) throw new Error('GOOGLE_AI_STUDIO_KEY not configured');

    // Verify ownership
    const { data: analysis, error: analysisErr } = await db
      .from('analyses')
      .select('id, user_id, self_person_id')
      .eq('id', analysis_id)
      .single();

    if (analysisErr || !analysis) return jsonResponse({ error: 'Analysis not found' }, 404);
    if (analysis.user_id !== userId) return jsonResponse({ error: 'Forbidden' }, 403);

    // Fetch all feature_matches without a verdict yet
    const { data: matches } = await db
      .from('feature_matches')
      .select('id, feature_type, winner_person_id, winner_similarity, winner_confidence')
      .eq('analysis_id', analysis_id)
      .is('llm_verdict', null);

    if (!matches || matches.length === 0) return jsonResponse({ narrated: 0 });

    // Get self's feature embeddings to find crop paths
    const { data: selfCrops } = await db
      .from('feature_embeddings')
      .select('feature_type, crop_storage_path')
      .eq('person_id', analysis.self_person_id)
      .not('crop_storage_path', 'is', null);

    const selfCropMap = new Map<string, string>(
      (selfCrops ?? []).map(r => [r.feature_type, r.crop_storage_path]),
    );

    // Build winner person → feature → crop path map
    const winnerPersonIds = [...new Set(matches.map(m => m.winner_person_id).filter(Boolean))];
    const { data: winnerCrops } = await db
      .from('feature_embeddings')
      .select('person_id, feature_type, crop_storage_path')
      .in('person_id', winnerPersonIds)
      .not('crop_storage_path', 'is', null);

    const winnerCropMap = new Map<string, string>();
    for (const r of winnerCrops ?? []) {
      winnerCropMap.set(`${r.person_id}::${r.feature_type}`, r.crop_storage_path);
    }

    // Get winner person display names + relationship tags
    const { data: persons } = await db
      .from('persons')
      .select('id, display_name, relationship_tag')
      .in('id', winnerPersonIds);

    const personMap = new Map((persons ?? []).map(p => [p.id, p]));

    let narrated = 0;

    for (const match of matches) {
      const selfPath = selfCropMap.get(match.feature_type);
      const winnerPath = winnerCropMap.get(`${match.winner_person_id}::${match.feature_type}`);

      if (!selfPath || !winnerPath) continue;

      const person = personMap.get(match.winner_person_id);
      const similarityPct = Math.round((match.winner_similarity ?? 0) * 100);

      try {
        const verdict = await getNarration({
          db,
          apiKey,
          featureType: match.feature_type,
          selfPath,
          winnerPath,
          similarityPct,
          relationshipTag: person?.relationship_tag ?? 'family member',
        });

        await db
          .from('feature_matches')
          .update({ llm_verdict: verdict })
          .eq('id', match.id);

        narrated++;
      } catch (err) {
        console.error(`[narrate-matches] failed for match ${match.id}:`, err);
        // Non-fatal: continue with other features
      }
    }

    return jsonResponse({ narrated });
  } catch (err) {
    await captureException(err, { functionName: 'narrate-matches', userId });
    const status = (err as Error & { status?: number }).status ?? 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});

interface NarrationParams {
  db: ReturnType<typeof getAdminClient>;
  apiKey: string;
  featureType: string;
  selfPath: string;
  winnerPath: string;
  similarityPct: number;
  relationshipTag: string;
}

async function getNarration(p: NarrationParams): Promise<string> {
  const { db, apiKey, featureType, selfPath, winnerPath, similarityPct, relationshipTag } = p;

  // Cache key: sha256 of concatenated paths + feature
  const cacheKey = await sha256(`${selfPath}::${winnerPath}::${featureType}`);
  const selfHash = await sha256(selfPath);
  const winnerHash = await sha256(winnerPath);

  // Check cache
  const { data: cached } = await db
    .from('verdict_cache')
    .select('verdict')
    .eq('user_crop_hash', selfHash)
    .eq('winner_crop_hash', winnerHash)
    .eq('feature_type', featureType)
    .maybeSingle();

  if (cached?.verdict) return cached.verdict;

  // Fetch both crop images as base64
  const [selfB64, winnerB64] = await Promise.all([
    fetchImageBase64(db, 'feature-crops', selfPath),
    fetchImageBase64(db, 'feature-crops', winnerPath),
  ]);

  // §9.2 User prompt template
  const userPrompt =
    `Feature: ${featureType.replace(/_/g, ' ')}\n` +
    `Similarity score: ${similarityPct}%\n` +
    `Relationship: ${relationshipTag}\n\nWrite the caption.`;

  // Call Gemini 2.5 Flash Vision
  const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role: 'user',
        parts: [
          { text: userPrompt },
          ...(selfB64 ? [{ inline_data: { mime_type: 'image/png', data: selfB64 } }] : []),
          ...(winnerB64 ? [{ inline_data: { mime_type: 'image/png', data: winnerB64 } }] : []),
        ],
      }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 80,
        topP: 0.95,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      ],
    }),
  });

  if (!geminiRes.ok) {
    throw new Error(`Gemini API error ${geminiRes.status}: ${await geminiRes.text()}`);
  }

  const geminiJson = await geminiRes.json();
  const rawVerdict: string =
    geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

  // §9.3 Post-filter: deny-list check
  const verdict = DENY_LIST.test(rawVerdict)
    ? fallbackVerdict(featureType, similarityPct, relationshipTag)
    : (rawVerdict || fallbackVerdict(featureType, similarityPct, relationshipTag));

  // Cache the result
  await db.from('verdict_cache').upsert(
    {
      user_crop_hash: selfHash,
      winner_crop_hash: winnerHash,
      feature_type: featureType,
      verdict,
      model_version: MODEL_VERSIONS.llm,
    },
    { onConflict: 'user_crop_hash,winner_crop_hash,feature_type' },
  );

  void cacheKey; // used only structurally above
  return verdict;
}

function fallbackVerdict(featureType: string, pct: number, relationship: string): string {
  const feature = featureType.replace(/_/g, ' ');
  return `Your ${feature} has a ${pct}% echo of your ${relationship}.`;
}

async function fetchImageBase64(
  db: ReturnType<typeof getAdminClient>,
  bucket: string,
  path: string,
): Promise<string | null> {
  try {
    const { data: signed } = await db.storage
      .from(bucket)
      .createSignedUrl(path, 300);
    if (!signed?.signedUrl) return null;

    const res = await fetch(signed.signedUrl);
    if (!res.ok) return null;

    const buf = await res.arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  } catch {
    return null;
  }
}

async function sha256(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
