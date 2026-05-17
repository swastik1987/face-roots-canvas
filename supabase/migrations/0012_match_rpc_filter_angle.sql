-- Migration: Update match_feature_embeddings RPC to only average "front" angle embeddings
-- This ensures profile (left/right) captures don't pollute the matching pipeline.

CREATE OR REPLACE FUNCTION match_feature_embeddings(
  query_embedding    vector(512),
  feature_type_filter text,
  family_person_ids  uuid[],
  match_count        int default 5
)
RETURNS TABLE (
  person_id  uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    fe.person_id,
    avg(1 - (fe.embedding <=> query_embedding)) AS similarity
  FROM feature_embeddings fe
  JOIN face_images fi ON fe.face_image_id = fi.id
  WHERE
    fe.feature_type = feature_type_filter
    AND fe.person_id = ANY(family_person_ids)
    AND fi.angle = 'front'
  GROUP BY fe.person_id
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_feature_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION match_feature_embeddings TO service_role;
