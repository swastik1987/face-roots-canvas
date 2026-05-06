## Goal

Make the exported Legacy Card show every matched facial feature (not just top 6), and present each as an expanded comparison row with side-by-side mini crops of the user and the matched relative — letting the card grow taller as needed.

## Changes

### 1. `supabase/functions/render-legacy-card/index.ts`
- Remove the `.limit(6)` on the `feature_matches` query so every match comes through.
- For each match, fetch the most recent `feature_embeddings.crop_storage_path` for:
  - the self person + that `feature_type` (user crop)
  - the winner person + that `feature_type` (relative crop)
- Sign each crop URL (5-min), download as base64 (jpeg/png), pass into the card. Run downloads with bounded concurrency (4 at a time) to keep cold-start time reasonable. On any failure, fall back to initials placeholder for that thumbnail.
- Compute the dynamic canvas height based on number of matches (e.g. `headerHeight + avatarHeight + sectionHeader + rows * rowHeight + footer`) and pass it to both Satori and Resvg (`fitTo` value updated). Width stays 1080.

### 2. `supabase/functions/_shared/cards/legacyCard.ts`
- Extend `CardMatch` with `userCropB64: string | null` and `winnerCropB64: string | null`.
- Extend `CardData` with a computed `height: number`.
- Replace `matchRow` with an expanded layout per feature:
  ```
  ┌──────────────────────────────────────────────┐
  │ [you 140²]  vs  [relative 140²]              │
  │  Feature name              82% ████████      │
  │  like {RelativeName} ({relationship})        │
  └──────────────────────────────────────────────┘
  ```
  - Square rounded thumbnails (140×140), gradient ring on the user's, neutral ring on the relative's, "vs" label between.
  - Feature label + similarity bar on the right of thumbnails (or below on narrower rows — single-column stacked layout works since width is 1080).
  - Show all matches (no slice).
- Use the dynamic `height` from `CardData` for the outer container.

### 3. No DB / RLS changes
All needed data already exists (`feature_embeddings.crop_storage_path`, `feature_matches`). No migrations.

### 4. Frontend
No changes — `Share.tsx` just consumes the signed URL; a taller image renders fine inside the existing `<img>` (it scales to width).

## Validation
- After deploy, call `render-legacy-card` for an existing analysis via `curl_edge_functions`, fetch the resulting PNG, and visually QA: confirm all features rendered, both crops visible, no clipped rows, footer present at bottom.
- Check edge function logs for crop-fetch failures.

## Out of scope
- Renaming "Family DNA Map" copy.
- Adding the LLM verdict caption (could be a follow-up).
- Caching crop downloads across renders.
