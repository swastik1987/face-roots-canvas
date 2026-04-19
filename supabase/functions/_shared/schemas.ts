/**
 * Zod schemas shared across Edge Functions.
 * Import from here to keep validation consistent.
 */
import { z } from 'npm:zod@3';

export { z };

/**
 * Parse a request body against a Zod schema. On validation failure,
 * throws an Error with `status = 400` and a user-safe message so the
 * outer handler returns 400 instead of a generic 500.
 */
export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    const err = new Error('Invalid JSON body') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    const err = new Error(`Invalid request: ${issues}`) as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  return result.data;
}

export const ValidateFaceInput = z.object({
  face_image_id: z.string().uuid(),
});

export const EmbedFaceInput = z.object({
  face_image_id: z.string().uuid(),
});

export const EmbedFeaturesInput = z.object({
  face_image_id: z.string().uuid(),
  crops: z.array(
    z.object({
      feature_type: z.enum([
        'eyes_left', 'eyes_right', 'nose', 'mouth', 'jawline',
        'forehead', 'eyebrows_left', 'eyebrows_right',
        'ear_left', 'ear_right', 'hairline', 'face_shape',
      ]),
      storage_path: z.string().min(1),
    }),
  ).min(1),
});

export const RunAnalysisInput = z.object({
  self_person_id: z.string().uuid(),
});

export const MatchFeaturesInput = z.object({
  analysis_id: z.string().uuid(),
});

export const RenderLegacyCardInput = z.object({
  analysis_id: z.string().uuid(),
});
