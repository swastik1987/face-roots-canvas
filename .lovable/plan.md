
## Goal
Fix the over-zoomed camera on `/capture`, ensure the full face fits inside the oval before auto-capture triggers, and make the alignment grid lines colored for better visual guidance.

## Root cause
`react-webcam` is rendered with `object-cover` inside a container, which crops + scales the video to fill the screen — this is why the face appears ~2x zoomed. Combined with `MIN_FACE_RATIO = 0.18` (face must fill 18% of frame), users have to bring their face very close, reinforcing the zoom feel.

## Changes (single file: `src/pages/Capture.tsx`)

### 1. Remove the camera "zoom" effect
- Switch the `<Webcam>` element from `object-cover` to `object-contain` so the full sensor frame is visible without cropping.
- Use `videoConstraints` of `{ width: 1280, height: 720, facingMode: 'user', aspectRatio: 16/9 }` to lock 1:1 (no digital zoom) and let the browser pick the native resolution.
- Center the video with flex; let letterboxing happen naturally on portrait phones rather than cropping.

### 2. Require the full face inside the oval
- Lower `MIN_FACE_RATIO` from `0.18` → `0.11` (face must fill ~11% of frame minimum) so users can stand at a comfortable distance.
- Add an `MAX_FACE_RATIO = 0.32` upper bound — if the face is too big (close to camera), show "Move back" hint and block capture.
- Add an oval-fit check using the landmark bbox: the face bbox must be **fully contained** within the oval region (computed in normalized video coords matching the SVG oval ~0.55 wide × 0.78 tall, centered). If any of the 4 bbox corners fall outside the oval, set hint to "Fit your whole face in the oval" and block capture.
- Update `alignmentHint` priority: no-face → too-close → too-small → outside-oval → yaw → pitch → aligned.

### 3. Colored grid lines for guidance
Replace the current monochrome white grid in `OvalOverlay` with a semantic color palette (matching the landing-page "What you'll discover" inspiration):
- **Eye line (33%)**: cyan (`#22d3ee`) — "eyes"
- **Nose line (58%)**: fuchsia (`#e879f9`) — "nose"
- **Mouth line (72%)**: amber (`#fbbf24`) — "mouth"
- **Vertical center axis**: soft white (`rgba(255,255,255,0.4)`) — neutral reference
- **Rule-of-thirds dashed grid**: very faint white (`rgba(255,255,255,0.15)`) — kept subtle so colored feature lines pop
- Each colored line gets a tiny label dot at the right edge (4px circle in matching color) so the meaning is implicit.
- When `isLocked` (capture armed), all colored lines brighten to full opacity; when only `hasFace` is true, they sit at 0.6 opacity; idle = 0.35.

### 4. Small copy additions
- Add new hint strings: `"Move back a little"` (too close) and `"Fit your whole face in the oval"` (bbox outside oval).

## Out of scope
- No changes to the cropping/upload pipeline — the captured 768×1024 oval JPEG output is unchanged.
- No changes to Home, Results, or edge functions.
- No new dependencies.
