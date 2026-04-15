/**
 * embed-face — generate a 512-dim ArcFace holistic embedding via Replicate InsightFace.
 *
 * Input:  { face_image_id: string }
 * Output: { embedding_id: string }
 *
 * Idempotent: if an embedding already exists for this face_image, returns it.
 */
import { handleCors, jsonResponse, requireAuth } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { replicateRun } from '../_shared/replicate.ts';
import { captureException } from '../_shared/sentry.ts';
import { EmbedFaceInput } from '../_shared/schemas.ts';
import { MODEL_VERSIONS } from '../_shared/models.ts';

// InsightFace buffalo_l on Replicate
// Model: abiruyt/insightface → buffalo_l produces 512-dim ArcFace embeddings
const INSIGHTFACE_VERSION =
  '2d1bb84fb3a52be3a8b8a2e4cf3e95d94e5e5c56cfa7e9e5b847e2c70c0c6cca';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let userId = 'unknown';
  try {
    const user = await requireAuth(req);
    userId = user.id;

    const body = await req.json();
    const { face_image_id } = EmbedFaceInput.parse(body);

    const db = getAdminClient();

    // Ownership check via join
    const { data: faceImage, error: faceErr } = await db
      .from('face_images')
      .select('storage_path, person_id, persons!inner(owner_user_id, id)')
      .eq('id', face_image_id)
      .single();

    if (faceErr || !faceImage) return jsonResponse({ error: 'Face image not found' }, 404);
    if ((faceImage.persons as any).owner_user_id !== userId) return jsonResponse({ error: 'Forbidden' }, 403);

    // Idempotency check
    const { data: existing } = await db
      .from('face_embeddings')
      .select('id')
      .eq('face_image_id', face_image_id)
      .maybeSingle();

    if (existing) return jsonResponse({ embedding_id: existing.id });

    // Signed URL for Replicate
    const { data: signed } = await db.storage
      .from('face-images-raw')
      .createSignedUrl(faceImage.storage_path, 900);

    if (!signed?.signedUrl) throw new Error('Could not create signed URL');

    // Call InsightFace via Replicate
    const output = await replicateRun(INSIGHTFACE_VERSION, {
      image: signed.signedUrl,
      model: 'buffalo_l',
    }) as { embedding: number[]; quality: number } | null;

    if (!output?.embedding || output.embedding.length !== 512) {
      throw new Error('InsightFace returned unexpected output');
    }

    // Store embedding
    const { data: inserted, error: insertErr } = await db
      .from('face_embeddings')
      .insert({
        person_id: faceImage.person_id,
        face_image_id,
        embedding: `[${output.embedding.join(',')}]`,
        quality_score: output.quality ?? null,
        model_version: MODEL_VERSIONS.face,
      })
      .select('id')
      .single();

    if (insertErr || !inserted) throw new Error(`DB insert failed: ${insertErr?.message}`);

    return jsonResponse({ embedding_id: inserted.id });
  } catch (err) {
    await captureException(err, { functionName: 'embed-face', userId });
    const status = (err as Error & { status?: number }).status ?? 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
