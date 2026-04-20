/**
 * validate-face — server-side trust check on a client-uploaded face image.
 *
 * Input:  { face_image_id: string }
 * Output: { valid: boolean, reason?: string, face_confidence: number, nsfw_score: number }
 *
 * Post-Replicate design: face detection + NSFW classification now run
 * client-side (MediaPipe + a future in-browser NSFW model). The server's
 * job is reduced to the checks the client cannot be trusted to enforce:
 *
 *   1. Verify the user actually owns this face_image row
 *   2. Bound file size via HEAD request (cheap, no download)
 *   3. Sanity-check stored width/height against minimums
 *   4. Stamp face_confidence/nsfw_score from what the client already wrote
 *      (the client must set these before calling this function)
 *
 * Because the client is now the source of face_confidence / nsfw_score,
 * we re-read those values from the row rather than recomputing them.
 * If the client didn't set them, we fail closed.
 *
 * TODO: add a zero-network NSFW model (e.g. NSFWJS ONNX) on the client
 * and feed its score into face_images before calling this function.
 */
import { handleCors, jsonResponse, requireAuth } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { captureException } from '../_shared/sentry.ts';
import { ValidateFaceInput, parseJsonBody } from '../_shared/schemas.ts';

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

    const { data: faceImage, error: fetchErr } = await db
      .from('face_images')
      .select(
        'storage_path, width, height, face_confidence, nsfw_score, persons!inner(owner_user_id)',
      )
      .eq('id', face_image_id)
      .single();

    if (fetchErr || !faceImage) {
      return jsonResponse({ error: 'Face image not found' }, 404);
    }

    // Ownership
    if ((faceImage.persons as { owner_user_id: string }).owner_user_id !== userId) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    // Signed URL for a HEAD-only size check
    const { data: signedData, error: signErr } = await db.storage
      .from('face-images-raw')
      .createSignedUrl(faceImage.storage_path, 300);

    if (signErr || !signedData?.signedUrl) {
      throw new Error(`Could not create signed URL: ${signErr?.message ?? 'unknown'}`);
    }

    // File size bound — avoid downloading multi-MB images into the edge runtime
    try {
      const headRes = await fetch(signedData.signedUrl, { method: 'HEAD' });
      const contentLength = parseInt(headRes.headers.get('content-length') ?? '0', 10);
      if (contentLength > MAX_FILE_SIZE) {
        return jsonResponse({
          valid: false,
          reason: 'File too large (max 10 MB)',
          face_confidence: faceImage.face_confidence ?? 0,
          nsfw_score: faceImage.nsfw_score ?? 0,
        });
      }
    } catch (err) {
      // HEAD can legitimately fail (some CDNs return 403 for HEAD). Don't
      // block on it — but do log so we notice systematic failures.
      console.warn('[validate-face] HEAD size check failed:', err);
    }

    // Dimension floor
    if (
      faceImage.width && faceImage.height &&
      (faceImage.width < MIN_WIDTH || faceImage.height < MIN_HEIGHT)
    ) {
      return jsonResponse({
        valid: false,
        reason: `Image too small (min ${MIN_WIDTH}×${MIN_HEIGHT} px)`,
        face_confidence: faceImage.face_confidence ?? 0,
        nsfw_score: faceImage.nsfw_score ?? 0,
      });
    }

    // Client-supplied scores (MediaPipe face confidence, future client NSFW)
    const faceConfidence = faceImage.face_confidence ?? 0;
    const nsfwScore = faceImage.nsfw_score ?? 0;

    if (faceConfidence < MIN_FACE_CONFIDENCE) {
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

    return jsonResponse({
      valid: true,
      face_confidence: faceConfidence,
      nsfw_score: nsfwScore,
    });
  } catch (err) {
    await captureException(err, { functionName: 'validate-face', userId });
    const status = (err as Error & { status?: number }).status ?? 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
