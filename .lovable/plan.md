

## Goal
1. Make the oval guide nearly fill the screen vertically (>80%) so users can easily centre their face.
2. After auto-capture, show a **preview screen** with the captured face plus **Retake** and **Submit** buttons — only upload on Submit.

## Changes

### 1. `OvalOverlay` — fill the viewport vertically (`src/pages/Capture.tsx`)
- Replace the fixed 260×340 SVG with a viewport-responsive oval. Make the SVG container ~92vh tall and width auto-derived from the 3:4 oval aspect (so it scales on any phone).
- Switch the SVG to `width="100%" height="100%"` filling its container, keep the `viewBox="0 0 260 340"` so all internal grid coordinates stay correct.
- Container wrapper: `style={{ height: '92vh', aspectRatio: '260/340' }}` centred in the screen, replacing the current fixed-pixel `<div className="relative">`.
- Remove the `marginTop: '-5%'` offset; centre it cleanly with flex.
- Net effect: oval fills >80% of the vertical screen, the alignment grid scales with it, the existing capture math (which uses video-pixel coords + landmarks) is unaffected.

### 2. New `captured_front` review step
Today `captured_front` auto-advances to `uploading` after 900 ms. Replace that with a manual review screen:

- Keep capture logic identical (still cropped to 768×1024 oval JPEG and stored in `useFaceStore.frames.front`).
- After `setStep('captured_front')`, **do not** schedule the timeout to `'uploading'`.
- Render a full-screen review overlay when `step === 'captured_front'`:
  - Show the captured oval JPEG (`frames.front.imageDataUrl`) inside a matching oval frame (reuse the same SVG clipPath approach as `FaceSilhouette`) so the user sees exactly what was captured.
  - Two buttons at the bottom:
    - **Retake** (ghost / outline): calls existing `retry()` → clears frames, returns to `detecting_front`.
    - **Submit** (primary `btn-gradient`): sets `step` to `'uploading'`, which triggers the existing `uploadAllFrames()` effect.
  - Hide the live camera feed and oval grid overlay while in this review state to avoid visual clutter (use `step === 'detecting_front' || step === 'loading'` to gate those).
- The success checkmark animation that currently shows during `captured_front` is removed (it now belongs in the post-Submit upload flow which already has its own "Saving your photo…" state).

### 3. Small copy/polish
- Top instruction bar gains a `captured_front` branch: "Looks good?" / "Retake or submit to continue."
- The auto-vibrate and shutter flash on capture remain (they signal the photo was taken).

## Out of scope
- No DB, edge function, or store schema changes (`useFaceStore` already holds the frame; we're just deferring its consumption).
- No changes to `uploadCrops.ts`, Home, or Results — same blob is uploaded, just on user confirmation.
- No new dependencies.

