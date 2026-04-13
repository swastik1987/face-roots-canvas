-- match_feature_embeddings: cosine similarity search for feature matching
-- Called by the match-features Edge Function.
--
-- Returns up to `match_count` family members ordered by descending cosine
-- similarity to the provided query_embedding, filtered by feature_type and
-- restricted to the supplied family_person_ids.

create or replace function match_feature_embeddings(
  query_embedding    vector(384),
  feature_type_filter text,
  family_person_ids  uuid[],
  match_count        int default 5
)
returns table (
  person_id  uuid,
  similarity float
)
language sql
stable
as $$
  select
    fe.person_id,
    avg(1 - (fe.embedding <=> query_embedding)) as similarity
  from feature_embeddings fe
  where
    fe.feature_type = feature_type_filter
    and fe.person_id = any(family_person_ids)
  group by fe.person_id
  order by similarity desc
  limit match_count;
$$;

-- Grant execute to authenticated users so the Edge Function (with service role)
-- can call it, and RLS is still enforced on the underlying table.
grant execute on function match_feature_embeddings to authenticated;
grant execute on function match_feature_embeddings to service_role;
