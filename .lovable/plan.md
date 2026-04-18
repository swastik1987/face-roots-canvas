

## Goal
Simplify capture to **front-angle only** with a high-precision guided oval + alignment grid, crop the face to that oval, and reuse the same oval thumbnail across Home and Results.

## Current state
- `Capture.tsx` runs a 3-angle state machine (front → left → right), uploads full webcam frames + landmarks, then crops features per angle in `uploadCrops.ts`.
- Side angles add `ear_left`/`ear_right` features but matching/results work fine without them.
- Home (`SelfAvatar`) and Results (`FaceSilhouette`) currently load the raw stored portrait and rely on CSS `object-position` / SVG `clipPath` to fake an oval crop. The actual stored image is the full webcam frame.

## Changes

### 1. `src/pages/Capture.tsx` — front-only flow
- Reduce `ANGLE_SEQUENCE` to a single entry (`front`). Drop `detecting_left/right`, `captured_left/right` steps.
- Remove the 3-step dot indicator; show a single "Align your face" header.
- Tighten front-angle thresholds for precision: `|yaw| < 8°`, `|pitch| < 8°`, `MIN_FACE_RATIO = 0.18`, `STABLE_MS = 1200`.
- Replace freeform screenshot with a **canvas-cropped oval portrait** at capture time:
  - Compute face bbox from landmarks → expand to match oval aspect (ry/rx ≈ 1.36) → pad ~15% → draw to a 768×1024 canvas → export JPEG.
  - This becomes the stored `face-images-raw` blob (already oval-aligned, no extra processing later).
- Persist a normalized `bbox` `{x, y, w, h}` (in normalized 0–1 coords of the cropped image) into `face_landmarks.landmarks_json` so downstream UI knows the face is centered.

### 2. `OvalOverlay` — high-precision grid
- Add inner alignment guides inside the existing oval:
  - **Vertical center line** (nose axis)
  - **Horizontal eye-line** at ~33% from top
  - **Nose tip line** at ~58%
  - **Mouth line** at ~72%
  - Faint **rule-of-thirds** dashed grid across the oval bounding box
- Lines render at 0.25 opacity normally, brighten to 0.5 when `hasFace` is true, and turn cyan when capture is locked. This gives users a clear feature-alignment target.
- Keep the progress arc + capture flash unchanged.

### 3. `src/lib/face/uploadCrops.ts` — front-only feature set
- Since we no longer capture sides, drop the `angle === 'left' | 'right'` branches that add `ear_left`/`ear_right`. Only `FRONT_FEATURES` are cropped.
- No schema change — `ear_left/right` simply won't be embedded; matching already handles missing features.

### 4. `src/pages/Home.tsx` — oval thumbnail
- Stored portrait is now already oval-aligned, so the avatar can drop the `object-position` heuristic and just use `object-cover` with `object-position: center`. Remove the landmark-fetch code in `self-thumbnail` query (simpler + faster).
- Same simplification for `family-thumbnail` (family upload flow already crops via `FaceCropDialog`).

### 5. `src/components/results/FaceSilhouette.tsx` — oval thumbnail reuse
- The existing `<image>` with `clipPath="url(#face-clip)"` already does the oval clip; since the source is now pre-cropped to oval, raise its opacity from `0.35` to `0.65` and remove the saturation filter so it reads as the user's actual face behind the pins.

### 6. `match-features` edge function
- No change needed — it averages whatever angles exist per feature; with one angle it just uses that single embedding (variance-based confidence will be `null`, already handled in UI).

## Out of scope
- No DB schema migration.
- No edge function changes.
- Family member upload flow is unchanged (already uses `FaceCropDialog`).
- "Sibling Mode" / Time Machine left as-is.

## Visual sketch

```text
┌────── camera feed ──────┐
│      ┌─ ─ ─ ─ ─ ┐       │
│     ╱             ╲     │   ← oval guide (cyan when locked)
│    │  · · | · · ·  │    │   ← vertical center
│    │ ─ ─ ─ ◉ ─ ─ ─ │    │   ← eye line
│    │     ─ ─ ─     │    │   ← nose tip line
│    │     ─ ─ ─     │    │   ← mouth line
│     ╲             ╱     │
│      └─ ─ ─ ─ ─ ┘       │
│   "Align your face"     │
└─────────────────────────┘
```

