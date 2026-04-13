-- ============================================================
-- Migration 0003: Storage buckets
-- Three private buckets; all access via signed URLs (≤15 min).
-- ============================================================

-- face-images-raw: Full portraits, default 7-day TTL
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'face-images-raw',
  'face-images-raw',
  false,
  10485760,  -- 10 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- feature-crops: Per-feature 224×224 PNGs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feature-crops',
  'feature-crops',
  false,
  2097152,  -- 2 MiB
  array['image/png']
)
on conflict (id) do nothing;

-- legacy-cards: Rendered share PNGs, 30-day TTL
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legacy-cards',
  'legacy-cards',
  false,
  5242880,  -- 5 MiB
  array['image/png']
)
on conflict (id) do nothing;

-- ============================================================
-- Storage RLS: users can only access objects in their own
-- namespaced path (<user_id>/<...>)
-- ============================================================

-- face-images-raw policies
create policy "face_images_raw_owner_select" on storage.objects
  for select using (
    bucket_id = 'face-images-raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "face_images_raw_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'face-images-raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "face_images_raw_owner_update" on storage.objects
  for update using (
    bucket_id = 'face-images-raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "face_images_raw_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'face-images-raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- feature-crops policies
create policy "feature_crops_owner_select" on storage.objects
  for select using (
    bucket_id = 'feature-crops'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "feature_crops_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'feature-crops'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "feature_crops_owner_update" on storage.objects
  for update using (
    bucket_id = 'feature-crops'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "feature_crops_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'feature-crops'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- legacy-cards policies
create policy "legacy_cards_owner_select" on storage.objects
  for select using (
    bucket_id = 'legacy-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "legacy_cards_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'legacy-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "legacy_cards_owner_update" on storage.objects
  for update using (
    bucket_id = 'legacy-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "legacy_cards_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'legacy-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
