-- Migration 0007: Sibling Mode stub data model
--
-- Adds the sibling_analyses table so that two users (or two self-persons
-- belonging to the same user) can be compared against the same parent pool.
--
-- Phase 7 ships the UI stub only.  The Edge Function that populates
-- sibling_feature_deltas is deferred to Phase 8.

-- ── sibling_analyses ─────────────────────────────────────────────────────────
-- Links two analyses that share the same set of parent persons.
-- Both analyses must have status = 'done' before a sibling comparison runs.

create table if not exists sibling_analyses (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  analysis_a_id   uuid not null references analyses(id) on delete cascade,
  analysis_b_id   uuid not null references analyses(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'done', 'error')),
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Each ordered pair is unique per owner
  unique (owner_user_id, analysis_a_id, analysis_b_id)
);

-- ── sibling_feature_deltas ───────────────────────────────────────────────────
-- Per-feature comparison: similarity_a vs similarity_b vs the same parent.

create table if not exists sibling_feature_deltas (
  id                  uuid primary key default gen_random_uuid(),
  sibling_analysis_id uuid not null references sibling_analyses(id) on delete cascade,
  feature_type        text not null,
  shared_person_id    uuid not null references persons(id),
  similarity_a        real not null,  -- person A vs shared_person
  similarity_b        real not null,  -- person B vs shared_person
  delta               real generated always as (similarity_a - similarity_b) stored,
  created_at          timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_sibling_analyses_owner
  on sibling_analyses (owner_user_id);

create index if not exists idx_sibling_analyses_a
  on sibling_analyses (analysis_a_id);

create index if not exists idx_sibling_analyses_b
  on sibling_analyses (analysis_b_id);

create index if not exists idx_sibling_feature_deltas_analysis
  on sibling_feature_deltas (sibling_analysis_id);

-- ── updated_at trigger ───────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sibling_analyses_updated_at
  before update on sibling_analyses
  for each row execute procedure set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table sibling_analyses        enable row level security;
alter table sibling_feature_deltas  enable row level security;

-- Users can only read/write their own sibling analyses
create policy "owner_all_sibling_analyses"
  on sibling_analyses for all
  using  (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Deltas are accessible if the parent sibling_analysis is owned by the user
create policy "owner_all_sibling_deltas"
  on sibling_feature_deltas for all
  using (
    exists (
      select 1 from sibling_analyses sa
      where sa.id = sibling_feature_deltas.sibling_analysis_id
        and sa.owner_user_id = auth.uid()
    )
  );
