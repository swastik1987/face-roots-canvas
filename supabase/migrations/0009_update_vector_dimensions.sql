-- Migration: Update feature_embeddings vector dimension from 384 to 768
-- Reason: Switching from DINOv2 ViT-S/14 (384-dim) to CLIP ViT-L/14 (768-dim)
-- on Replicate (andreasjansson/clip-features). The previous DINOv2 model
-- version hash was a placeholder and never worked.
--
-- This migration is safe because no valid embeddings exist yet
-- (the old model hash was invalid, so no rows were ever inserted).

-- Clear any potentially invalid embeddings from failed attempts
DELETE FROM feature_embeddings;

-- Drop the existing HNSW index (can't alter vector dimension with it in place)
DROP INDEX IF EXISTS feature_embeddings_embedding_idx;

-- Alter the embedding column from vector(384) to vector(768)
ALTER TABLE feature_embeddings
  ALTER COLUMN embedding TYPE vector(768);

-- Recreate the HNSW index for cosine similarity
CREATE INDEX feature_embeddings_embedding_idx
  ON feature_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Update the match_feature_embeddings RPC function to accept 768-dim vectors
CREATE OR REPLACE FUNCTION match_feature_embeddings(
  query_embedding    vector(768),
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
