/**
 * Replace a person's face images with a freshly uploaded set.
 *
 * After the caller has inserted one or more new face_images rows for a
 * person, invoke this helper with the IDs of those new rows. It will:
 *
 *  1. Delete every *other* face_images row for that person. The FK
 *     cascade removes associated face_landmarks, face_embeddings, and
 *     feature_embeddings automatically.
 *  2. Best-effort purge the raw portraits and feature crops for those
 *     old images from Supabase Storage. Storage failures are logged,
 *     never thrown — otherwise a transient storage hiccup would strand
 *     the user mid-flow even though the DB is already consistent.
 *  3. Mark every non-stale `analyses` row owned by this user as stale,
 *     so the UI can prompt "re-run analysis" and prior results don't
 *     appear as if they reflect the new photo.
 *
 * Scope: touches only this person's data. Re-capturing the self photo
 * does not affect family members, and vice versa.
 */
import { supabase } from "@/lib/supabase";

export interface ReplaceFaceImagesArgs {
  userId: string;
  personId: string;
  /** IDs of the newly-inserted face_images rows that must be preserved. */
  keepFaceImageIds: string[];
}

export interface ReplaceFaceImagesResult {
  deletedImageIds: string[];
  analysesMarkedStale: number;
}

export async function replacePersonFaceImages({
  userId,
  personId,
  keepFaceImageIds,
}: ReplaceFaceImagesArgs): Promise<ReplaceFaceImagesResult> {
  // 1. Find every face_image belonging to this person that is NOT in the keep set.
  const { data: allImages, error: listErr } = await supabase
    .from("face_images")
    .select("id, storage_path")
    .eq("person_id", personId);

  if (listErr) {
    console.warn("[replaceFaceImages] Could not list existing images:", listErr.message);
    return { deletedImageIds: [], analysesMarkedStale: 0 };
  }

  const keepSet = new Set(keepFaceImageIds);
  const toDelete = (allImages ?? []).filter((img) => !keepSet.has(img.id));

  if (toDelete.length === 0) {
    // First-ever capture for this person — nothing to purge, but we still
    // invalidate analyses so a prior empty/failed run doesn't linger.
    const staleCount = await markAnalysesStale(userId);
    return { deletedImageIds: [], analysesMarkedStale: staleCount };
  }

  const oldIds = toDelete.map((i) => i.id);
  const oldRawPaths = toDelete.map((i) => i.storage_path).filter(Boolean);

  // 2a. Purge raw portraits (best-effort).
  if (oldRawPaths.length) {
    const { error: rawErr } = await supabase.storage
      .from("face-images-raw")
      .remove(oldRawPaths);
    if (rawErr) {
      console.warn("[replaceFaceImages] raw purge failed:", rawErr.message);
    }
  }

  // 2b. Purge per-image feature crops (best-effort).
  // Crops live at feature-crops/{userId}/{personId}/{faceImageId}/*.png
  const cropPaths: string[] = [];
  for (const imageId of oldIds) {
    const prefix = `${userId}/${personId}/${imageId}`;
    const { data: files, error: listCropErr } = await supabase.storage
      .from("feature-crops")
      .list(prefix);
    if (listCropErr) {
      console.warn(`[replaceFaceImages] list crops failed at ${prefix}:`, listCropErr.message);
      continue;
    }
    for (const file of files ?? []) {
      cropPaths.push(`${prefix}/${file.name}`);
    }
  }
  if (cropPaths.length) {
    const { error: cropErr } = await supabase.storage
      .from("feature-crops")
      .remove(cropPaths);
    if (cropErr) {
      console.warn("[replaceFaceImages] crop purge failed:", cropErr.message);
    }
  }

  // 3. Delete the old DB rows. Cascade cleans up landmarks/embeddings.
  //    This is the source of truth — storage is best-effort and will
  //    eventually be reaped; the matching RPC already ignores any
  //    embeddings not tied to the latest face_image per person.
  const { error: delErr } = await supabase.from("face_images").delete().in("id", oldIds);
  if (delErr) {
    console.warn("[replaceFaceImages] DB delete failed:", delErr.message);
  }

  // 4. Invalidate any completed analyses for this user.
  const analysesMarkedStale = await markAnalysesStale(userId);

  return { deletedImageIds: oldIds, analysesMarkedStale };
}

async function markAnalysesStale(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("analyses")
    .update({ is_stale: true })
    .eq("user_id", userId)
    .eq("is_stale", false)
    .select("id");
  if (error) {
    console.warn("[replaceFaceImages] mark analyses stale failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
