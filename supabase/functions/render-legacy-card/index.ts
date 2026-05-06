/**
 * render-legacy-card — generate a 1080×1920 PNG share card for an analysis.
 *
 * Input:  { analysis_id: string }
 * Output: { signed_url: string }
 *
 * Pipeline:
 *   1. Auth + ownership check
 *   2. Fetch analysis, top-6 feature matches, persons, profile (plan)
 *   3. Fetch self's front-angle face image as base64 (optional)
 *   4. Build Satori element tree via legacyCard.ts
 *   5. Satori → SVG string
 *   6. resvg-wasm → PNG buffer
 *   7. Upload to legacy-cards/{userId}/{analysisId}.png
 *   8. Update analyses.card_storage_path
 *   9. Return 15-min signed URL
 *
 * Idempotent: if card_storage_path already exists, skips render and returns
 * a fresh signed URL for the existing file.
 */
import satori from 'npm:satori@0.10.14';
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.0';

import { handleCors, jsonResponse, requireAuth } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { captureException } from '../_shared/sentry.ts';
import { RenderLegacyCardInput, parseJsonBody } from '../_shared/schemas.ts';
import { buildLegacyCard, type CardMatch } from '../_shared/cards/legacyCard.ts';

// ── Font + WASM caching (per isolate cold-start) ────────────────────────────

let wasmReady = false;
let interFonts: { name: string; weight: number; style: string; data: ArrayBuffer }[] | null = null;

// Satori requires TTF/OTF (not WOFF/WOFF2). Use a simple static TTF to avoid variable-font parsing issues.
const INTER_STATIC_TTF =
  'https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf';
const RESVG_WASM =
  'https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.0/index_bg.wasm';

async function ensureWasm() {
  if (!wasmReady) {
    const resp = await fetch(RESVG_WASM);
    await initWasm(resp);
    wasmReady = true;
  }
}

async function getInterFonts() {
  if (!interFonts) {
    const buf = await fetch(INTER_STATIC_TTF).then((r) => {
      if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
      return r.arrayBuffer();
    });
    interFonts = [
      { name: 'Inter', weight: 400, style: 'normal', data: buf },
      { name: 'Inter', weight: 600, style: 'normal', data: buf },
      { name: 'Inter', weight: 700, style: 'normal', data: buf },
      { name: 'Inter', weight: 800, style: 'normal', data: buf },
    ];
  }
  return interFonts;
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let userId = 'unknown';
  try {
    const user = await requireAuth(req);
    userId = user.id;

    const { analysis_id } = await parseJsonBody(req, RenderLegacyCardInput);

    const db = getAdminClient();

    // ── 1. Fetch analysis & verify ownership ─────────────────────────────────
    const { data: analysis, error: aErr } = await db
      .from('analyses')
      .select('id, user_id, self_person_id, card_storage_path')
      .eq('id', analysis_id)
      .single();

    if (aErr || !analysis) return jsonResponse({ error: 'Analysis not found' }, 404);
    if (analysis.user_id !== userId) return jsonResponse({ error: 'Forbidden' }, 403);

    // ── 2. Idempotency: re-use existing card if already rendered ─────────────
    if (analysis.card_storage_path) {
      const { data: existing } = await db.storage
        .from('legacy-cards')
        .createSignedUrl(analysis.card_storage_path, 900);
      if (existing?.signedUrl) {
        return jsonResponse({ signed_url: existing.signedUrl });
      }
      // If signed URL creation failed the file may be missing — fall through to re-render
    }

    // ── 3. Fetch profile (plan) ───────────────────────────────────────────────
    const { data: profile } = await db
      .from('profiles')
      .select('plan, display_name')
      .eq('id', userId)
      .single();

    const isPro = profile?.plan === 'pro';

    // ── 4. Fetch all feature matches + winner persons ────────────────────────
    const { data: matches } = await db
      .from('feature_matches')
      .select('feature_type, winner_person_id, winner_similarity')
      .eq('analysis_id', analysis_id)
      .order('winner_similarity', { ascending: false });

    const winnerIds = [
      ...new Set((matches ?? []).map((m) => m.winner_person_id).filter(Boolean)),
    ];

    const { data: persons } = winnerIds.length
      ? await db.from('persons').select('id, display_name, relationship_tag').in('id', winnerIds)
      : { data: [] };

    const personMap = new Map((persons ?? []).map((p) => [p.id, p]));

    // ── 5. Fetch self person name ─────────────────────────────────────────────
    const { data: selfPerson } = await db
      .from('persons')
      .select('display_name')
      .eq('id', analysis.self_person_id)
      .single();

    const selfName = selfPerson?.display_name ?? profile?.display_name ?? 'You';

    // ── 6. Helper: fetch a storage object as base64 ──────────────────────────
    async function fetchCropB64(bucket: string, path: string | null | undefined): Promise<string | null> {
      if (!path) return null;
      try {
        const { data: signed } = await db.storage.from(bucket).createSignedUrl(path, 300);
        if (!signed?.signedUrl) return null;
        const res = await fetch(signed.signedUrl);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      } catch {
        return null;
      }
    }

    // ── 7. Fetch self's front-angle face image as base64 ─────────────────────
    let selfImageB64: string | null = null;
    try {
      const { data: faceImg } = await db
        .from('face_images')
        .select('storage_path')
        .eq('person_id', analysis.self_person_id)
        .eq('angle', 'front')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      selfImageB64 = await fetchCropB64('face-images-raw', faceImg?.storage_path);
    } catch {
      // Non-fatal
    }

    // ── 8. Fetch per-feature crop paths for self + each winner ───────────────
    const allMatches = matches ?? [];
    const featureTypes = [...new Set(allMatches.map((m) => m.feature_type))];

    const { data: selfCrops } = featureTypes.length
      ? await db
          .from('feature_embeddings')
          .select('feature_type, crop_storage_path, created_at')
          .eq('person_id', analysis.self_person_id)
          .in('feature_type', featureTypes)
          .order('created_at', { ascending: false })
      : { data: [] };

    const selfCropMap = new Map<string, string>();
    for (const r of selfCrops ?? []) {
      if (r.crop_storage_path && !selfCropMap.has(r.feature_type)) {
        selfCropMap.set(r.feature_type, r.crop_storage_path);
      }
    }

    const winnerCropMap = new Map<string, string>();
    if (winnerIds.length && featureTypes.length) {
      const { data: winnerCrops } = await db
        .from('feature_embeddings')
        .select('person_id, feature_type, crop_storage_path, created_at')
        .in('person_id', winnerIds)
        .in('feature_type', featureTypes)
        .order('created_at', { ascending: false });
      for (const r of winnerCrops ?? []) {
        const key = `${r.person_id}:${r.feature_type}`;
        if (r.crop_storage_path && !winnerCropMap.has(key)) {
          winnerCropMap.set(key, r.crop_storage_path);
        }
      }
    }

    // Bounded-concurrency download of crop images
    async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
      const results: R[] = new Array(items.length);
      let i = 0;
      const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
        while (true) {
          const idx = i++;
          if (idx >= items.length) return;
          results[idx] = await fn(items[idx]);
        }
      });
      await Promise.all(workers);
      return results;
    }

    const cropPairs = await mapLimit(allMatches, 4, async (m) => {
      const selfPath = selfCropMap.get(m.feature_type);
      const winnerPath = m.winner_person_id
        ? winnerCropMap.get(`${m.winner_person_id}:${m.feature_type}`)
        : null;
      const [userCropB64, winnerCropB64] = await Promise.all([
        fetchCropB64('feature-crops', selfPath),
        fetchCropB64('feature-crops', winnerPath),
      ]);
      return { userCropB64, winnerCropB64 };
    });

    // ── 9. Build card data ────────────────────────────────────────────────────
    const cardMatches: CardMatch[] = allMatches.map((m, idx) => {
      const p = personMap.get(m.winner_person_id);
      return {
        featureType: m.feature_type,
        winnerName: p?.display_name ?? 'Family member',
        relationship: p?.relationship_tag ?? 'family',
        similarity: m.winner_similarity ?? 0,
        userCropB64: cropPairs[idx]?.userCropB64 ?? null,
        winnerCropB64: cropPairs[idx]?.winnerCropB64 ?? null,
      };
    });

    // ── 10. Initialise WASM + fonts in parallel ───────────────────────────────
    const [fonts] = await Promise.all([getInterFonts(), ensureWasm()]);

    // ── 11. Compute dynamic canvas height (expanded rows) ────────────────────
    const HEADER_HEIGHT = 100 + 72 + 14 + 30 + 56;
    const AVATAR_BLOCK = 64 + 400 + 64;
    const SECTION_HEADER = 52 + 40 + 36;
    const ROW_HEIGHT = 230;
    const FOOTER_HEIGHT = 40 + 48 + 24 * 3 + 26 + 1;
    const cardHeight = Math.max(
      1920,
      HEADER_HEIGHT + AVATAR_BLOCK + SECTION_HEADER + cardMatches.length * ROW_HEIGHT + FOOTER_HEIGHT,
    );

    // ── 12. Satori → SVG ──────────────────────────────────────────────────────
    const element = buildLegacyCard({
      selfName,
      selfImageB64,
      matches: cardMatches,
      isPro,
      height: cardHeight,
    });

    const svg = await (satori as any)(element, {
      width: 1080,
      height: cardHeight,
      fonts,
    });

    // ── 10. resvg → PNG ───────────────────────────────────────────────────────
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1080 },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // ── 11. Upload to legacy-cards bucket ─────────────────────────────────────
    const storagePath = `${userId}/${analysis_id}.png`;
    const { error: uploadErr } = await db.storage
      .from('legacy-cards')
      .upload(storagePath, pngBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    // ── 12. Persist card path on analysis ────────────────────────────────────
    await db
      .from('analyses')
      .update({ card_storage_path: storagePath })
      .eq('id', analysis_id);

    // ── 13. Return 15-min signed URL ──────────────────────────────────────────
    const { data: signedData, error: signErr } = await db.storage
      .from('legacy-cards')
      .createSignedUrl(storagePath, 900);

    if (signErr || !signedData?.signedUrl) {
      throw new Error('Could not create signed URL for legacy card');
    }

    return jsonResponse({ signed_url: signedData.signedUrl });
  } catch (err) {
    await captureException(err, { functionName: 'render-legacy-card', userId });
    const status = (err as Error & { status?: number }).status ?? 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
