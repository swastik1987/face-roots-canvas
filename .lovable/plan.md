## Goal

When a user uploads a photo with more than one detected face on the Family Add / Self upload flow, let them tap which face is theirs (or the relative's) before continuing to the existing crop confirmation screen with the usual "Looks good", "Adjust crop", and "Try a different photo" actions.

## Current behavior

In `src/pages/FamilyAdd.tsx`, after MediaPipe runs in `handleFile`, the code unconditionally takes `result.faceLandmarks[0]`, computes a bbox, crops, and jumps to the `crop` phase. Photos with multiple faces silently pick the first detected face.

## Proposed change (frontend only)

1. **New phase**: add `"choose_face"` to the `Phase` union (between `detecting` and `crop`).

2. **In `handleFile`**:
   - After detection, if `numFaces === 1`, keep today's behavior (auto-crop → `crop` phase).
   - If `numFaces > 1`, compute a bbox for every detected face, store them all in a new `faceCandidates` state (`Array<{ index, bbox, landmarks, pose }>`), filter by the existing pose gate (skip faces that fail yaw/pitch — if all fail, show the same error as today), and set phase to `choose_face`.
   - If `numFaces === 0`, unchanged error path.

3. **New `choose_face` screen** (rendered inline in `FamilyAdd.tsx`, matching the existing glass-card style):
   - Title: "Multiple faces found — pick one"
   - Show `previewUrl` with one tappable bordered box per candidate, numbered 1..N. Tapping a box selects that face (highlight in cyan, others dim).
   - Primary button: "Use this face" — runs the existing crop logic for the selected candidate (`cropFaceBlob` with its bbox, set `bboxPercent`, `detectionResult`, `cropBlob`, `cropUrl`) and advances to `crop`. From there the user already has "Looks good", "Adjust crop", "Try a different photo".
   - Secondary button: "Try a different photo" → `reset()`.

4. **State additions**: `faceCandidates`, `selectedFaceIndex`. Reset both in `reset()`.

5. **Step indicator**: treat `choose_face` the same as `detecting` (step index 1) so the header stepper doesn't jump.

## Out of scope

- Changing `validate-face` or any Edge Function (single-face is still what gets uploaded).
- Changing the capture (selfie) flow — only the upload path can have multiple faces.
- Changing the existing crop / confirm / save logic.

## Files touched

- `src/pages/FamilyAdd.tsx` (only).
