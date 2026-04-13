/**
 * Zod schemas shared across Edge Functions.
 * Import from here to keep validation consistent.
 */
import { z } from 'npm:zod@3';

export { z };

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
