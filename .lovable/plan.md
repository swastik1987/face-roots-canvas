

## Goal
Replace the similarity-driven hue (currently `cyan→magenta` based on score) with a **per-feature color palette** inspired by the landing page's "What you'll discover" section (cyan/blue, fuchsia/purple, amber/orange + extensions). Each facial feature gets its own signature color, so users instantly distinguish nose vs eyes vs jawline vs mouth on both the silhouette pins and feature cards.

## Design — color assignment

Map each `FeatureType` to a `{ from, to, solid }` triple (Tailwind gradient classes + a solid HSL for SVG). Three landing-page colors extended to cover all 12 features, grouped logically:

| Feature group | Color | Tailwind gradient | Solid |
|---|---|---|---|
| `nose` | Cyan/blue | `from-cyan to-blue-400` | `hsl(186 100% 55%)` |
| `eyes_left`, `eyes_right` | Fuchsia/purple | `from-fuchsia-500 to-purple-500` | `hsl(292 84% 61%)` |
| `jawline`, `face_shape` | Amber/orange | `from-amber-400 to-orange-500` | `hsl(35 95% 55%)` |
| `mouth` | Rose/pink | `from-rose-400 to-pink-500` | `hsl(340 90% 62%)` |
| `eyebrows_left`, `eyebrows_right` | Emerald/teal | `from-emerald-400 to-teal-500` | `hsl(160 80% 50%)` |
| `forehead`, `hairline` | Indigo/violet | `from-indigo-400 to-violet-500` | `hsl(245 80% 65%)` |
| `ear_left`, `ear_right` | Lime/green | `from-lime-400 to-green-500` | `hsl(90 75% 55%)` |

## Changes

### 1. New file: `src/lib/results/featureColors.ts`
- Export `FEATURE_COLORS: Record<string, { gradient: string; solid: string; from: string; to: string }>`.
- Export helper `getFeatureColor(featureType: string)` with a sensible fallback (cyan) for unknown types.

### 2. `src/components/results/FaceSilhouette.tsx`
- Remove the `pinColor(similarity)` hue-interpolation function.
- Replace its single call site with `getFeatureColor(pin.featureType).solid`.
- Pin glow, ring, dot, and `%` label all now reflect the feature's signature color (not similarity). Similarity is still communicated via the percentage text and the card's progress bar.

### 3. `src/components/results/FeatureCard.tsx`
- Remove the inline `hue` interpolation (`186 + (310-186) * similarity`).
- Use `getFeatureColor(featureType)` for:
  - Left swatch bar (solid color + glow)
  - Similarity `%` text color
  - Progress bar fill — switch from inline `style={{ background }}` to a `bg-gradient-to-r ${gradient}` className for the richer two-tone look matching the landing page mock cards.

### 4. Optional polish (small)
- In `FeatureCard.tsx`, keep the confidence badge palette unchanged (cyan/yellow/muted) — it encodes a different dimension.
- Keep the `Sparkles` verdict accent as cyan (brand color) — distinct from feature colors.

## Out of scope
- No data model changes.
- No changes to Splash/Home — only Results screen and its subcomponents.
- Confidence badge colors stay as-is (separate semantic axis).

