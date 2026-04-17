

## Goal
Make "Delete my account" wipe ALL user data (DB rows + storage files + auth user) so the same email can sign up fresh.

## Current state analysis

The `delete-my-data` edge function exists and the cascade chain is solid:
- All user-scoped tables FK to `auth.users(id) ON DELETE CASCADE`: `profiles`, `persons`, `analyses`, `consent_events`, `rate_limit_events`, `sibling_analyses`
- Child tables (`face_images`, `face_landmarks`, `face_embeddings`, `feature_embeddings`, `feature_matches`, `sibling_feature_deltas`) cascade from their parents

So deleting the **auth user** alone cascades to every table. Storage files must be purged manually (Supabase doesn't auto-delete storage objects).

## Issues with current function

1. **Row-counting block (lines 50–61) is broken** — passes `'irrelevant'` as `person_id` for non-analysis tables, returning 0 every time. Cosmetic only, but useless.
2. **Order of operations**: profile is deleted before `auth.admin.deleteUser`, but the auth deletion already cascades to profile. The intermediate `profiles.delete()` is redundant.
3. **Auth user deletion errors are swallowed** — if `deleteUser` fails, the user thinks the account is gone but can't re-register (email still taken in `auth.users`). Must throw on failure.
4. **Storage paths verified correct**: client uploads use `${user.id}/...` prefix in all three buckets (`face-images-raw`, `feature-crops`, `legacy-cards`), so the `purgeDirectory(bucket, userId)` walk is right.

## Changes

### 1. Rewrite `supabase/functions/delete-my-data/index.ts`
- Count rows BEFORE deletion using proper joins (via `persons` for child tables) so the receipt is accurate.
- Purge all 3 storage buckets under `${userId}/` prefix (already correct).
- Delete the auth user via `db.auth.admin.deleteUser(userId)` — this cascades to every public table automatically. Drop the redundant `profiles.delete()`.
- Check the result of `deleteUser` and throw if it fails, so the client surfaces the error and the user isn't left in a half-deleted state.

### 2. Frontend `src/pages/Settings.tsx` — minor robustness
- After successful deletion, call `supabase.auth.signOut()` (already there via `signOut`) and clear any local Zustand state (e.g. `faceStore`) so a fresh signup starts clean. Navigate to `/auth` rather than `/`.

### 3. Deploy
- Redeploy `delete-my-data` edge function.

## Re-signup confirmation
Because we call `auth.admin.deleteUser(userId)`, the row in `auth.users` is hard-deleted, freeing the email. The same person can sign up again with the same email and get a fresh `auth.users.id` — the `handle_new_user` trigger creates a new `profiles` row automatically. No additional work needed.

## Out of scope
- No schema migration needed — cascade FKs already cover every table including `sibling_analyses`, `sibling_feature_deltas`, `rate_limit_events`, `consent_events`.
- `verdict_cache` is intentionally not user-scoped (it's a global LLM response cache keyed by image hashes, not user_id) — leave it alone.

