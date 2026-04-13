-- ============================================================
-- Migration 0002: Row-Level Security policies
-- Every table is scoped to auth.uid().
-- ============================================================

-- ============================================================
-- profiles
-- ============================================================
alter table profiles enable row level security;

create policy "profiles_owner_select" on profiles
  for select using (id = auth.uid());
create policy "profiles_owner_insert" on profiles
  for insert with check (id = auth.uid());
create policy "profiles_owner_update" on profiles
  for update using (id = auth.uid());
create policy "profiles_owner_delete" on profiles
  for delete using (id = auth.uid());

-- ============================================================
-- persons
-- ============================================================
alter table persons enable row level security;

create policy "persons_owner_select" on persons
  for select using (owner_user_id = auth.uid());
create policy "persons_owner_insert" on persons
  for insert with check (owner_user_id = auth.uid());
create policy "persons_owner_update" on persons
  for update using (owner_user_id = auth.uid());
create policy "persons_owner_delete" on persons
  for delete using (owner_user_id = auth.uid());

-- ============================================================
-- face_images (joined through persons)
-- ============================================================
alter table face_images enable row level security;

create policy "face_images_owner_select" on face_images
  for select using (
    exists (
      select 1 from persons
      where persons.id = face_images.person_id
        and persons.owner_user_id = auth.uid()
    )
  );
create policy "face_images_owner_insert" on face_images
  for insert with check (
    exists (
      select 1 from persons
      where persons.id = face_images.person_id
        and persons.owner_user_id = auth.uid()
    )
  );
create policy "face_images_owner_update" on face_images
  for update using (
    exists (
      select 1 from persons
      where persons.id = face_images.person_id
        and persons.owner_user_id = auth.uid()
    )
  );
create policy "face_images_owner_delete" on face_images
  for delete using (
    exists (
      select 1 from persons
      where persons.id = face_images.person_id
        and persons.owner_user_id = auth.uid()
    )
  );

-- ============================================================
-- face_landmarks (joined through face_images → persons)
-- ============================================================
alter table face_landmarks enable row level security;

create policy "face_landmarks_owner_select" on face_landmarks
  for select using (
    exists (
      select 1 from face_images fi
      join persons p on p.id = fi.person_id
      where fi.id = face_landmarks.face_image_id
        and p.owner_user_id = auth.uid()
    )
  );
create policy "face_landmarks_owner_insert" on face_landmarks
  for insert with check (
    exists (
      select 1 from face_images fi
      join persons p on p.id = fi.person_id
      where fi.id = face_landmarks.face_image_id
        and p.owner_user_id = auth.uid()
    )
  );
create policy "face_landmarks_owner_update" on face_landmarks
  for update using (
    exists (
      select 1 from face_images fi
      join persons p on p.id = fi.person_id
      where fi.id = face_landmarks.face_image_id
        and p.owner_user_id = auth.uid()
    )
  );
create policy "face_landmarks_owner_delete" on face_landmarks
  for delete using (
    exists (
      select 1 from face_images fi
      join persons p on p.id = fi.person_id
      where fi.id = face_landmarks.face_image_id
        and p.owner_user_id = auth.uid()
    )
  );

-- ============================================================
-- face_embeddings (joined through persons)
-- ============================================================
alter table face_embeddings enable row level security;

create policy "face_embeddings_owner_select" on face_embeddings
  for select using (
    exists (
      select 1 from persons
      where persons.id = face_embeddings.person_id
        and persons.owner_user_id = auth.uid()
    )
  );
create policy "face_embeddings_owner_insert" on face_embeddings
  for insert with check (
    exists (
      select 1 from persons
      where persons.id = face_embeddings.person_id
        and persons.owner_user_id = auth.uid()
    )
  );
create policy "face_embeddings_owner_update" on face_embeddings
  for update using (
    exists (
      select 1 from persons
      where persons.id = face_embeddings.person_id
        and persons.owner_user_id = auth.uid()
    )
  );
create policy "face_embeddings_owner_delete" on face_embeddings
  for delete using (
    exists (
      select 1 from persons
      where persons.id = face_embeddings.person_id
        and persons.owner_user_id = auth.uid()
    )
  );

-- ============================================================
-- feature_embeddings (joined through persons)
-- ============================================================
alter table feature_embeddings enable row level security;

create policy "feature_embeddings_owner_select" on feature_embeddings
  for select using (
    exists (
      select 1 from persons
      where persons.id = feature_embeddings.person_id
        and persons.owner_user_id = auth.uid()
    )
  );
create policy "feature_embeddings_owner_insert" on feature_embeddings
  for insert with check (
    exists (
      select 1 from persons
      where persons.id = feature_embeddings.person_id
        and persons.owner_user_id = auth.uid()
    )
  );
create policy "feature_embeddings_owner_update" on feature_embeddings
  for update using (
    exists (
      select 1 from persons
      where persons.id = feature_embeddings.person_id
        and persons.owner_user_id = auth.uid()
    )
  );
create policy "feature_embeddings_owner_delete" on feature_embeddings
  for delete using (
    exists (
      select 1 from persons
      where persons.id = feature_embeddings.person_id
        and persons.owner_user_id = auth.uid()
    )
  );

-- ============================================================
-- analyses
-- ============================================================
alter table analyses enable row level security;

create policy "analyses_owner_select" on analyses
  for select using (user_id = auth.uid());
create policy "analyses_owner_insert" on analyses
  for insert with check (user_id = auth.uid());
create policy "analyses_owner_update" on analyses
  for update using (user_id = auth.uid());
create policy "analyses_owner_delete" on analyses
  for delete using (user_id = auth.uid());

-- ============================================================
-- feature_matches (joined through analyses)
-- ============================================================
alter table feature_matches enable row level security;

create policy "feature_matches_owner_select" on feature_matches
  for select using (
    exists (
      select 1 from analyses
      where analyses.id = feature_matches.analysis_id
        and analyses.user_id = auth.uid()
    )
  );
create policy "feature_matches_owner_insert" on feature_matches
  for insert with check (
    exists (
      select 1 from analyses
      where analyses.id = feature_matches.analysis_id
        and analyses.user_id = auth.uid()
    )
  );
create policy "feature_matches_owner_update" on feature_matches
  for update using (
    exists (
      select 1 from analyses
      where analyses.id = feature_matches.analysis_id
        and analyses.user_id = auth.uid()
    )
  );
create policy "feature_matches_owner_delete" on feature_matches
  for delete using (
    exists (
      select 1 from analyses
      where analyses.id = feature_matches.analysis_id
        and analyses.user_id = auth.uid()
    )
  );

-- ============================================================
-- consent_events
-- ============================================================
alter table consent_events enable row level security;

create policy "consent_events_owner_select" on consent_events
  for select using (user_id = auth.uid());
create policy "consent_events_owner_insert" on consent_events
  for insert with check (user_id = auth.uid());
-- consent_events are immutable — no update/delete from client

-- ============================================================
-- rate_limit_events
-- ============================================================
alter table rate_limit_events enable row level security;

create policy "rate_limit_events_owner_select" on rate_limit_events
  for select using (user_id = auth.uid());
create policy "rate_limit_events_owner_insert" on rate_limit_events
  for insert with check (user_id = auth.uid());
-- rate_limit_events are immutable — no update/delete from client
