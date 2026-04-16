-- Migration: Update feature_embeddings vector dimension from 768 to 512
-- Reason: Switching from server-side CLIP ViT-L/14 (768-dim, Replicate API)
-- to client-side CLIP ViT-B/32 (512-dim, Transformers.js in browser).
-- This eliminates the dependency on paid Replicate API.
--
-- Safe because no valid embeddings exist yet (Replicate token was never funded).

-- Clear any stale/invalid embeddings
DELETE FROM feature_embeddings;

-- Drop the existing HNSW index (can't alter vector dimension with it in place)
DROP INDEX IF EXISTS feature_embeddings_embedding_idx;

-- Alter the embedding column from vector(768) to vector(512)
ALTER TABLE feature_embeddings
  ALTER COLUMN embedding TYPE vector(512);

-- Recreate the HNSW index for cosine similarity
CREATE INDEX feature_embeddings_embedding_idx
  ON feature_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Update the match_feature_embeddings RPC function to accept 512-dim vectors
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
