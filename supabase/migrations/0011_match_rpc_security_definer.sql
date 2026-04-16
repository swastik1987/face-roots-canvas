-- Fix: match_feature_embeddings must be SECURITY DEFINER so it can
-- read feature_embeddings when called from edge functions via service role.
-- Without this, RLS blocks the query because the SQL function runs as
-- SECURITY INVOKER by default, and there's no auth.uid() set for service role calls.

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
  WHERE
    fe.feature_type = feature_type_filter
    AND fe.person_id = ANY(family_person_ids)
  GROUP BY fe.person_id
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Ensure both roles can call it
GRANT EXECUTE ON FUNCTION match_feature_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION match_feature_embeddings TO service_role;
