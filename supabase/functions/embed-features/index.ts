/**
 * embed-features — generate per-feature CLIP 768-dim embeddings.
 *
 * Input:  { face_image_id, crops: [{feature_type, storage_path}, ...] }
 * Output: { count: number }
 *
 * Uses andreasjansson/clip-features on Replicate (ViT-L/14, 768-dim).
 * Fans out with Promise.all (capped at concurrency 4).
 * Retries each crop up to 3× with exponential back-off.
 */
import { handleCors, jsonResponse, requireAuth } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { replicateRun } from '../_shared/replicate.ts';
import { captureException } from '../_shared/sentry.ts';
import { EmbedFeaturesInput } from '../_shared/schemas.ts';
import { MODEL_VERSIONS } from '../_shared/models.ts';

// andreasjansson/clip-features on Replicate — 149M+ runs, ViT-L/14 768-dim
const CLIP_VERSION =
  '75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a';

const CONCURRENCY = 4;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let userId = 'unknown';
  try {
    const user = await requireAuth(req);
    userId = user.id;

    const body = await req.json();
    const { face_image_id, crops } = EmbedFeaturesInput.parse(body);

    const db = getAdminClient();

    // Ownership check
    const { data: faceImage, error: faceErr } = await db
      .from('face_images')
      .select('person_id, persons!inner(owner_user_id)')
      .eq('id', face_image_id)
      .single();

    if (faceErr || !faceImage) return jsonResponse({ error: 'Face image not found' }, 404);
    if ((faceImage.persons as any).owner_user_id !== userId) return jsonResponse({ error: 'Forbidden' }, 403);

    // Process crops in batches of CONCURRENCY
    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < crops.length; i += CONCURRENCY) {
      const batch = crops.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(crop => embedCrop(db, faceImage.person_id, face_image_id, crop)),
      );
      successCount += results.filter(r => r.status === 'fulfilled').length;

      // Log failures but don't abort the whole batch
      for (const r of results) {
        if (r.status === 'rejected') {
          const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
          console.error('[embed-features] crop failed:', errMsg);
          errors.push(errMsg);
        }
      }
    }

    return jsonResponse({ count: successCount, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    await captureException(err, { functionName: 'embed-features', userId });
    const status = (err as Error & { status?: number }).status ?? 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});

async function embedCrop(
  db: ReturnType<typeof import('../_shared/supabaseAdmin.ts').getAdminClient>,
  personId: string,
  faceImageId: string,
  crop: { feature_type: string; storage_path: string },
  attempt = 1,
): Promise<void> {
  // Check idempotency
  const { data: existing } = await db
    .from('feature_embeddings')
    .select('id')
    .eq('face_image_id', faceImageId)
    .eq('feature_type', crop.feature_type)
    .maybeSingle();

  if (existing) return;

  // Signed URL for crop image
  const { data: signed } = await db.storage
    .from('feature-crops')
    .createSignedUrl(crop.storage_path, 900);

  if (!signed?.signedUrl) throw new Error(`No signed URL for crop ${crop.storage_path}`);

  let embedding: number[];
  try {
    // andreasjansson/clip-features takes an "inputs" field with newline-separated
    // text/image-URLs. For a single image, pass the URL directly.
    const output = await replicateRun(CLIP_VERSION, {
      inputs: signed.signedUrl,
    });

    // Output is an array of { input, embedding } objects
    const results = output as Array<{ input: string; embedding: number[] }> | null;
    if (!results || results.length === 0 || !results[0]?.embedding) {
      throw new Error('CLIP returned unexpected output');
    }

    embedding = results[0].embedding;

    if (embedding.length !== 768) {
      throw new Error(`CLIP returned ${embedding.length}-dim embedding, expected 768`);
    }
  } catch (err) {
    if (attempt < 3) {
      await sleep(500 * 2 ** (attempt - 1));
      return embedCrop(db, personId, faceImageId, crop, attempt + 1);
    }
    throw err;
  }

  await db.from('feature_embeddings').insert({
    person_id: personId,
    face_image_id: faceImageId,
    feature_type: crop.feature_type,
    crop_storage_path: crop.storage_path,
    embedding: `[${embedding.join(',')}]`,
    model_version: MODEL_VERSIONS.features,
  });
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
