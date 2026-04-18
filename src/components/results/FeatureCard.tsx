/**
 * FeatureCard — expandable card showing:
 *   - Side-by-side crop images (self vs winner)
 *   - Similarity % with a progress bar
 *   - Confidence badge (High / Medium / Low)
 *   - Gemini-generated LLM verdict
 *   - Winner person name + relationship
 */
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { getFeatureColor } from '@/lib/results/featureColors';

export type ConfidenceTier = 'High' | 'Medium' | 'Low';

function confidenceTier(score: number | null): ConfidenceTier {
  if (score == null) return 'Low';
  if (score >= 0.75) return 'High';
  if (score >= 0.45) return 'Medium';
  return 'Low';
}

const CONFIDENCE_COLORS: Record<ConfidenceTier, string> = {
  High:   'text-cyan   bg-cyan/10   border-cyan/30',
  Medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  Low:    'text-muted-foreground bg-white/5 border-white/10',
};

const FEATURE_LABELS: Record<string, string> = {
  eyes_left:      'Left eye',
  eyes_right:     'Right eye',
  nose:           'Nose',
  mouth:          'Mouth',
  jawline:        'Jawline',
  forehead:       'Forehead',
  eyebrows_left:  'Left eyebrow',
  eyebrows_right: 'Right eyebrow',
  ear_left:       'Left ear',
  ear_right:      'Right ear',
  hairline:       'Hairline',
  face_shape:     'Face shape',
};

export interface FeatureCardData {
  featureType: string;
  winnerName: string;
  winnerRelationship: string;
  similarity: number;       // 0..1
  confidence: number | null;
  verdict: string | null;
  selfCropUrl: string | null;
  winnerCropUrl: string | null;
}

interface FeatureCardProps extends FeatureCardData {
  /** Whether this card is the focused/active one (scrolled into view). */
  isActive?: boolean;
  index: number;
}

export function FeatureCard({
  featureType,
  winnerName,
  winnerRelationship,
  similarity,
  confidence,
  verdict,
  selfCropUrl,
  winnerCropUrl,
  isActive,
  index,
}: FeatureCardProps) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(similarity * 100);
  const tier = confidenceTier(confidence);
  const label = FEATURE_LABELS[featureType] ?? featureType.replace(/_/g, ' ');
  const relationship = winnerRelationship.replace(/_/g, ' ');

  // Per-feature signature color (matches FaceSilhouette pin)
  const featureColor = getFeatureColor(featureType);
  const accentColor = featureColor.solid;

  return (
    <motion.div
      className={`glass-card overflow-hidden transition-shadow ${isActive ? 'ring-1 ring-white/20' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.06, type: 'spring', stiffness: 260, damping: 22 }}
    >
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        {/* Color swatch */}
        <div
          className="w-2 h-8 rounded-full flex-shrink-0"
          style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}66` }}
        />

        {/* Feature + winner */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">{label}</p>
          <p className="text-xs text-muted-foreground truncate">
            {winnerName} · {relationship}
          </p>
        </div>

        {/* Similarity % */}
        <span
          className="text-xl font-bold font-mono tabular-nums"
          style={{ color: accentColor }}
        >
          {pct}%
        </span>

        {/* Confidence badge */}
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE_COLORS[tier]}`}
        >
          {tier}
        </span>

        {/* Chevron */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
        </motion.div>
      </button>

      {/* ── Similarity bar ─────────────────────────────────────────────────── */}
      <div className="h-0.5 bg-white/5 mx-4">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${featureColor.gradient}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ delay: 0.2 + index * 0.06, duration: 0.7, ease: 'easeOut' }}
        />
      </div>

      {/* ── Expanded detail ────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pt-3 pb-4 space-y-4">
              {/* Side-by-side crops */}
              <div className="flex gap-3">
                <CropImage url={selfCropUrl} label="You" />
                <CropImage url={winnerCropUrl} label={winnerName} />
              </div>

              {/* Verdict */}
              {verdict ? (
                <div className="flex items-start gap-2 bg-white/5 rounded-xl p-3">
                  <Sparkles size={14} className="text-cyan mt-0.5 flex-shrink-0" />
                  <p className="text-sm italic text-foreground/90 leading-snug">{verdict}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Narration generating…</p>
              )}

              {/* Disclaimer */}
              <p className="text-[10px] text-muted-foreground text-center">
                Fun resemblance analysis — not a genetic or paternity test.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CropImage({ url, label }: { url: string | null; label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <div className="w-full aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center">
        {url ? (
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="text-muted-foreground text-xs text-center px-2">No crop</div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}
