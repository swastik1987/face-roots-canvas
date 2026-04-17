

## Goal
Improve UX of the "Delete my account" flow in `src/pages/Settings.tsx`:
1. Show a progress bar while deletion runs
2. Show a clear error popup (toast) if it fails
3. Auto sign-out + redirect on success (already done — verify)

## Current state
- `handleDeleteAccount` already calls the edge function, clears frames, signs out, navigates to `/auth`.
- Errors are shown as inline text inside the AlertDialog (`deleteError`).
- No progress indicator beyond a small spinner on the button.
- No toast notifications.

## Changes (single file: `src/pages/Settings.tsx`)

### 1. Add a progress bar during deletion
- Add local state `progress` (0–100).
- While `deleting === true`, replace the dialog footer buttons with a `<Progress />` component (`@/components/ui/progress`) plus a "Deleting your account…" label and step text.
- Drive progress with a simulated stepper since the edge function is a single request:
  - 10% — "Preparing…" (immediately on click)
  - 35% — "Erasing photos & embeddings…" (after ~400ms)
  - 70% — "Removing account…" (after ~1200ms)
  - 100% — "Done" (on success, just before navigate)
- Use `setInterval` or chained `setTimeout`s, cleared on completion/error.

### 2. Error popup via sonner toast
- Import `toast` from `sonner`.
- On failure: call `toast.error("Failed to delete account", { description: errorMessage })`, reset `deleting`/`progress`, keep the dialog open so the user can retry or cancel.
- Remove the inline `deleteError` text (replaced by toast) — or keep it as a fallback inside the dialog. Plan: drop inline text, use toast only for cleaner UI.

### 3. Auto sign-out on success (verify + harden)
- Already calls `signOut()` then `navigate('/auth', { replace: true })`. Add a brief `toast.success("Account deleted")` before navigation so the user gets feedback on the next screen.
- Ensure dialog cannot be dismissed (`onOpenChange` no-op) while `deleting === true` to prevent the user closing it mid-request.

### 4. Disable cancel during deletion
- `AlertDialogCancel` already has `disabled={deleting}`. Also disable the destructive action and prevent backdrop close while deleting.

## Out of scope
- No edge function changes — the backend already returns proper error JSON.
- No new dependencies (sonner + Progress already installed).

