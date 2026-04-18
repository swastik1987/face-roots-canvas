/**
 * Per-feature color palette for the Results screen.
 * Inspired by the "What you'll discover" section of the landing page.
 *
 * Each feature gets a signature color so users can instantly distinguish
 * nose vs eyes vs jawline vs mouth on both the silhouette pins and cards.
 */

export interface FeatureColor {
  /** Tailwind gradient classes (e.g. "from-cyan to-blue-400") */
  gradient: string;
  /** Solid HSL color string for SVG fill/stroke */
  solid: string;
  /** Tailwind "from-..." class alone */
  from: string;
  /** Tailwind "to-..." class alone */
  to: string;
}

export const FEATURE_COLORS: Record<string, FeatureColor> = {
  nose:           { from: 'from-cyan',           to: 'to-blue-400',     gradient: 'from-cyan to-blue-400',           solid: 'hsl(186 100% 55%)' },
  eyes_left:      { from: 'from-fuchsia-500',    to: 'to-purple-500',   gradient: 'from-fuchsia-500 to-purple-500',  solid: 'hsl(292 84% 61%)' },
  eyes_right:     { from: 'from-fuchsia-500',    to: 'to-purple-500',   gradient: 'from-fuchsia-500 to-purple-500',  solid: 'hsl(292 84% 61%)' },
  jawline:        { from: 'from-amber-400',      to: 'to-orange-500',   gradient: 'from-amber-400 to-orange-500',    solid: 'hsl(35 95% 55%)'  },
  face_shape:     { from: 'from-amber-400',      to: 'to-orange-500',   gradient: 'from-amber-400 to-orange-500',    solid: 'hsl(35 95% 55%)'  },
  mouth:          { from: 'from-rose-400',       to: 'to-pink-500',     gradient: 'from-rose-400 to-pink-500',       solid: 'hsl(340 90% 62%)' },
  eyebrows_left:  { from: 'from-emerald-400',    to: 'to-teal-500',     gradient: 'from-emerald-400 to-teal-500',    solid: 'hsl(160 80% 50%)' },
  eyebrows_right: { from: 'from-emerald-400',    to: 'to-teal-500',     gradient: 'from-emerald-400 to-teal-500',    solid: 'hsl(160 80% 50%)' },
  forehead:       { from: 'from-indigo-400',     to: 'to-violet-500',   gradient: 'from-indigo-400 to-violet-500',   solid: 'hsl(245 80% 65%)' },
  hairline:       { from: 'from-indigo-400',     to: 'to-violet-500',   gradient: 'from-indigo-400 to-violet-500',   solid: 'hsl(245 80% 65%)' },
  ear_left:       { from: 'from-lime-400',       to: 'to-green-500',    gradient: 'from-lime-400 to-green-500',      solid: 'hsl(90 75% 55%)'  },
  ear_right:      { from: 'from-lime-400',       to: 'to-green-500',    gradient: 'from-lime-400 to-green-500',      solid: 'hsl(90 75% 55%)'  },
};

const FALLBACK: FeatureColor = {
  from: 'from-cyan',
  to: 'to-blue-400',
  gradient: 'from-cyan to-blue-400',
  solid: 'hsl(186 100% 55%)',
};

export function getFeatureColor(featureType: string): FeatureColor {
  return FEATURE_COLORS[featureType] ?? FALLBACK;
}
