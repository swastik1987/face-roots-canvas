-- verdict_cache: avoids re-billing Gemini for identical crop pairs.
-- Keyed by sha256 hashes of the two crop storage paths (used as a stable
-- content proxy — paths are deterministic per person+feature+image).

create table verdict_cache (
  user_crop_hash   text not null,
  winner_crop_hash text not null,
  feature_type     text not null,
  verdict          text not null,
  model_version    text not null default 'gemini-2.5-flash',
  created_at       timestamptz default now(),
  primary key (user_crop_hash, winner_crop_hash, feature_type)
);

-- No RLS needed — this is a server-side cache accessed only by the
-- service-role key inside Edge Functions. No user data is stored here
-- (hashes are not reversible to images).
alter table verdict_cache enable row level security;

-- Service role bypasses RLS automatically; no policy needed for anon/authed
-- since the Edge Function uses service role exclusively.
