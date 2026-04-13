-- ============================================================
-- Migration 0001: Initial schema
-- Enable extensions and create all core tables.
-- ============================================================

-- Extensions
create extension if not exists "vector";
create extension if not exists "pg_net";
create extension if not exists "pgcrypto";

-- ============================================================
-- profiles (extends auth.users)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  locale text default 'en',
  plan text default 'free' check (plan in ('free', 'pro')),
  age_attested_18_plus boolean default false,
  age_attested_at timestamptz,
  created_at timestamptz default now()
);

-- Auto-create profile row when a new user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- persons (family tree nodes)
-- ============================================================
create table if not exists persons (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  relationship_tag text not null,
  -- 'self'|'mother'|'father'|'maternal_grandma'|'maternal_grandpa'
  -- |'paternal_grandma'|'paternal_grandpa'|'sibling'|'uncle'|'aunt'|'child'|'other'
  generation int not null default 0,
  -- 0=self, +1=parent, +2=grandparent, -1=child
  is_self boolean not null default false,
  birth_year_approx int,
  created_at timestamptz default now(),
  constraint one_self_per_user unique (owner_user_id, is_self) deferrable initially deferred
);
create index if not exists persons_owner_user_id_idx on persons (owner_user_id);

-- ============================================================
-- face_images (raw portraits; encrypted bucket, TTL lifecycle)
-- ============================================================
create table if not exists face_images (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references persons(id) on delete cascade,
  storage_path text not null,
  angle text not null check (angle in ('front', 'left', 'right', 'unknown')),
  capture_method text not null check (capture_method in ('guided_capture', 'upload_cropped')),
  width int,
  height int,
  blur_score float,       -- Laplacian variance, higher = sharper
  face_confidence float,  -- MediaPipe confidence 0..1
  nsfw_score float,       -- 0..1
  expires_at timestamptz, -- null = keep, else soft-delete target
  created_at timestamptz default now()
);
create index if not exists face_images_person_id_idx on face_images (person_id);
create index if not exists face_images_expires_at_idx on face_images (expires_at) where expires_at is not null;

-- ============================================================
-- face_landmarks (MediaPipe 478 landmarks + pose)
-- ============================================================
create table if not exists face_landmarks (
  id uuid primary key default gen_random_uuid(),
  face_image_id uuid not null references face_images(id) on delete cascade,
  landmarks_json jsonb not null,
  pose_yaw float,
  pose_pitch float,
  pose_roll float,
  created_at timestamptz default now()
);
create index if not exists face_landmarks_face_image_id_idx on face_landmarks (face_image_id);

-- ============================================================
-- face_embeddings (holistic, InsightFace buffalo_l, 512-dim)
-- ============================================================
create table if not exists face_embeddings (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references persons(id) on delete cascade,
  face_image_id uuid not null references face_images(id) on delete cascade,
  embedding vector(512) not null,
  quality_score float,
  model_version text not null,  -- e.g. 'buffalo_l@2024-02'
  created_at timestamptz default now()
);
create index if not exists face_embeddings_hnsw_idx on face_embeddings using hnsw (embedding vector_cosine_ops);
create index if not exists face_embeddings_person_id_idx on face_embeddings (person_id);

-- ============================================================
-- feature_embeddings (per-crop, DINOv2 ViT-S/14, 384-dim)
-- ============================================================
create table if not exists feature_embeddings (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references persons(id) on delete cascade,
  face_image_id uuid not null references face_images(id) on delete cascade,
  feature_type text not null,
  -- 'eyes_left'|'eyes_right'|'nose'|'mouth'|'jawline'|'forehead'
  -- |'eyebrows_left'|'eyebrows_right'|'ear_left'|'ear_right'
  -- |'hairline'|'face_shape'
  crop_storage_path text,
  embedding vector(384) not null,
  quality_score float,
  model_version text not null,  -- e.g. 'dinov2-vits14@2024-01'
  created_at timestamptz default now()
);
create index if not exists feature_embeddings_hnsw_idx on feature_embeddings using hnsw (embedding vector_cosine_ops);
create index if not exists feature_embeddings_person_feature_idx on feature_embeddings (person_id, feature_type);

-- ============================================================
-- analyses (a "run" that produces a DNA map)
-- ============================================================
create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  self_person_id uuid not null references persons(id),
  status text not null default 'pending'
    check (status in ('pending','embedding','matching','narrating','rendering','done','failed')),
  error_message text,
  model_versions jsonb,  -- {face: '...', features: '...', llm: '...'}
  started_at timestamptz default now(),
  completed_at timestamptz
);
create index if not exists analyses_user_id_idx on analyses (user_id, started_at desc);

-- ============================================================
-- feature_matches (per-feature resemblance results)
-- ============================================================
create table if not exists feature_matches (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  feature_type text not null,
  winner_person_id uuid references persons(id),
  winner_similarity float,           -- 0..1
  winner_confidence float,           -- computed across 3 angles when available
  runners_up jsonb,                  -- [{person_id, similarity}, ...]
  llm_verdict text,                  -- playful one-liner
  created_at timestamptz default now()
);
create index if not exists feature_matches_analysis_id_idx on feature_matches (analysis_id);

-- ============================================================
-- consent_events (DPDP/GDPR audit trail)
-- ============================================================
create table if not exists consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('granted', 'revoked', 'updated')),
  scopes jsonb not null,             -- {embeddings:true, raw_images:false, sharing:true}
  policy_version text not null,
  user_agent text,
  ip_hash text,                      -- sha256(ip + daily_salt), never raw IP
  created_at timestamptz default now()
);
create index if not exists consent_events_user_id_idx on consent_events (user_id, created_at desc);

-- ============================================================
-- rate_limit_events
-- ============================================================
create table if not exists rate_limit_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,              -- 'run_analysis'|'embed_features'|...
  created_at timestamptz default now()
);
create index if not exists rate_limit_events_idx on rate_limit_events (user_id, action, created_at desc);
