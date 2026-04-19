-- Migration: harden re-capture flow + mark stale analyses
--
-- 1. Add `is_stale` to analyses so the UI can prompt "re-run analysis"
--    whenever the underlying face images have been replaced.
-- 2. Rewrite match_feature_embeddings to consider only the LATEST face_image
--    per person (DISTINCT ON), so any transient duplicate (e.g. a partial
--    cleanup failure) cannot skew similarity scores.

ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS analyses_user_stale_idx
  ON analyses (user_id, is_stale);

-- Replace RPC with a latest-image-per-person variant.
-- For each family person, pick their single most recent front-angle
-- face_image, then average cosine similarity across that image's
-- feature embeddings only.

CREATE OR REPLACE FUNCTION match_feature_embeddings(
  query_embedding     vector(512),
  feature_type_filter text,
  family_person_ids   uuid[],
  match_count         int default 5
)
RETURNS TABLE (
  person_id  uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH latest_image AS (
    SELECT DISTINCT ON (fi.person_id)
      fi.id         AS face_image_id,
      fi.person_id
    FROM face_images fi
    WHERE fi.person_id = ANY(family_person_ids)
      AND fi.angle = 'front'
    ORDER BY fi.person_id, fi.created_at DESC
  )
  SELECT
    fe.person_id,
    avg(1 - (fe.embedding <=> query_embedding)) AS similarity
  FROM feature_embeddings fe
  JOIN latest_image li ON fe.face_image_id = li.face_image_id
  WHERE fe.feature_type = feature_type_filter
  GROUP BY fe.person_id
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_feature_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION match_feature_embeddings TO service_role;
