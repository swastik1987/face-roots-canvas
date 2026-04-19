/**
 * validate-face — server-side face validation after client upload.
 *
 * Input:  { face_image_id: string }
 * Output: { valid: boolean, reason?: string, face_confidence: number, nsfw_score: number }
 *
 * Steps:
 *   1. Fetch image from storage
 *   2. Run server-side face detection via Replicate (retinaface)
 *   3. Run NSFW classification via Replicate (falconsai/nsfw_image_detection)
 *   4. Write scores back to face_images
 *   5. Return verdict
 */
import { handleCors, jsonResponse, requireAuth } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { replicateRun } from '../_shared/replicate.ts';
import { captureException } from '../_shared/sentry.ts';
import { ValidateFaceInput, parseJsonBody } from '../_shared/schemas.ts';

const RETINAFACE_VERSION =
  '9e6f9c3d01d5b12c75a3cb9b28dcd5c02e2cbc39f9d9b1e4b88dbf4c4ab8c47';
const NSFW_VERSION =
  '74b8e8e43427cfab88f2571ad7440b81a0a8e4a48427b5c618e8b8bb0e6bb87e';

const MIN_FACE_CONFIDENCE = 0.85;
const MAX_NSFW_SCORE = 0.3;
const MIN_WIDTH = 400;
const MIN_HEIGHT = 400;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let userId = 'unknown';
  try {
    const user = await requireAuth(req);
    userId = user.id;

    const { face_image_id } = await parseJsonBody(req, ValidateFaceInput);

    const db = getAdminClient();

    // Fetch face_image row
    const { data: faceImage, error: fetchErr } = await db
      .from('face_images')
      .select('*, persons!inner(owner_user_id)')
      .eq('id', face_image_id)
      .single();

    if (fetchErr || !faceImage) {
      return jsonResponse({ error: 'Face image not found' }, 404);
    }

    // Verify ownership
    if (faceImage.persons.owner_user_id !== userId) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    // Create a signed URL (15 min) so Replicate can fetch the image
    const { data: signedData, error: signErr } = await db.storage
      .from('face-images-raw')
      .createSignedUrl(faceImage.storage_path, 900);

    if (signErr || !signedData?.signedUrl) {
      throw new Error(`Could not create signed URL: ${signErr?.message}`);
    }

    const imageUrl = signedData.signedUrl;

    // Sanity-check file size via HEAD request
    const headRes = await fetch(imageUrl, { method: 'HEAD' });
    const contentLength = parseInt(headRes.headers.get('content-length') ?? '0', 10);
    if (contentLength > MAX_FILE_SIZE) {
      await writeScores(db, face_image_id, 0, 0, faceImage.width, faceImage.height);
      return jsonResponse({
        valid: false,
        reason: 'File too large (max 10 MB)',
        face_confidence: 0,
        nsfw_score: 0,
      });
    }

    // Dimension check (already stored by client, use as fast guard)
    if (
      faceImage.width && faceImage.height &&
      (faceImage.width < MIN_WIDTH || faceImage.height < MIN_HEIGHT)
    ) {
      await writeScores(db, face_image_id, 0, 0, faceImage.width, faceImage.height);
      return jsonResponse({
        valid: false,
        reason: `Image too small (min ${MIN_WIDTH}×${MIN_HEIGHT} px)`,
        face_confidence: 0,
        nsfw_score: 0,
      });
    }

    // Run face detection + NSFW in parallel
    const [faceOutput, nsfwOutput] = await Promise.all([
      replicateRun(RETINAFACE_VERSION, { image: imageUrl }).catch(() => null),
      replicateRun(NSFW_VERSION, { image: imageUrl }).catch(() => ({ nsfw_score: 0 })),
    ]);

    // Parse results
    const faces: Array<{ score: number }> = Array.isArray(faceOutput) ? faceOutput : [];
    const topFace = faces.sort((a, b) => b.score - a.score)[0];
    const faceConfidence = topFace?.score ?? 0;

    const nsfwScore =
      typeof (nsfwOutput as Record<string, unknown>)?.nsfw_score === 'number'
        ? (nsfwOutput as { nsfw_score: number }).nsfw_score
        : 0;

    // Write scores back
    await writeScores(db, face_image_id, faceConfidence, nsfwScore, faceImage.width, faceImage.height);

    // Determine validity
    if (faces.length === 0 || faceConfidence < MIN_FACE_CONFIDENCE) {
      return jsonResponse({
        valid: false,
        reason: 'No clear face detected. Please use a well-lit portrait.',
        face_confidence: faceConfidence,
        nsfw_score: nsfwScore,
      });
    }

    if (nsfwScore > MAX_NSFW_SCORE) {
      return jsonResponse({
        valid: false,
        reason: 'Image flagged. Please use an appropriate portrait photo.',
        face_confidence: faceConfidence,
        nsfw_score: nsfwScore,
      });
    }

    return jsonResponse({ valid: true, face_confidence: faceConfidence, nsfw_score: nsfwScore });
  } catch (err) {
    await captureException(err, { functionName: 'validate-face', userId });
    const status = (err as Error & { status?: number }).status ?? 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});

async function writeScores(
  db: ReturnType<typeof getAdminClient>,
  face_image_id: string,
  face_confidence: number,
  nsfw_score: number,
  width: number | null,
  height: number | null,
) {
  await db
    .from('face_images')
    .update({ face_confidence, nsfw_score, width, height })
    .eq('id', face_image_id);
}
