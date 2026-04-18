/**
 * FaceSilhouette — SVG face outline with animated feature hotspot pins.
 *
 * Each feature with a match gets a glowing pin that animates in sequentially.
 * Clicking a pin fires onFeatureClick(featureType).
 * The active pin pulses with a neon glow.
 */
import { motion } from 'framer-motion';
import { getFeatureColor } from '@/lib/results/featureColors';

export type FeatureType =
  | 'eyes_left' | 'eyes_right' | 'nose' | 'mouth' | 'jawline'
  | 'forehead' | 'eyebrows_left' | 'eyebrows_right'
  | 'ear_left' | 'ear_right' | 'hairline' | 'face_shape';

interface HotspotDef {
  x: number;
  y: number;
  label: string;
}

// Positions on a 200 × 280 viewBox face
const HOTSPOT_POSITIONS: Record<FeatureType, HotspotDef> = {
  hairline:        { x: 100, y: 35,  label: 'Hairline' },
  forehead:        { x: 100, y: 62,  label: 'Forehead' },
  eyebrows_left:   { x: 64,  y: 92,  label: 'Eyebrow' },
  eyebrows_right:  { x: 136, y: 92,  label: 'Eyebrow' },
  eyes_left:       { x: 64,  y: 112, label: 'Eye' },
  eyes_right:      { x: 136, y: 112, label: 'Eye' },
  ear_left:        { x: 22,  y: 138, label: 'Ear' },
  ear_right:       { x: 178, y: 138, label: 'Ear' },
  nose:            { x: 100, y: 148, label: 'Nose' },
  mouth:           { x: 100, y: 182, label: 'Mouth' },
  jawline:         { x: 100, y: 218, label: 'Jawline' },
  face_shape:      { x: 100, y: 138, label: 'Face shape' },
};

interface HotspotPin {
  featureType: FeatureType;
  similarity: number;   // 0..1
  verdict?: string | null;
}

interface FaceSilhouetteProps {
  pins: HotspotPin[];
  activeFeature: FeatureType | null;
  onFeatureClick: (f: FeatureType) => void;
  selfFaceUrl?: string | null;
}

export default function FaceSilhouette({ pins, activeFeature, onFeatureClick, selfFaceUrl }: FaceSilhouetteProps) {
  return (
    <svg
      viewBox="0 0 200 280"
      className="w-full max-w-[220px] mx-auto select-none"
      aria-label="Face silhouette with feature hotspots"
    >
      {/* ── Clip path for face photo ───────────────────────────────────── */}
      <defs>
        <clipPath id="face-clip">
          <ellipse cx="100" cy="138" rx="74" ry="98" />
        </clipPath>
      </defs>

      {/* ── Self face photo (behind outline) ─────────────────────────────── */}
      {selfFaceUrl && (
        <image
          href={selfFaceUrl}
          x="26" y="40"
          width="148" height="196"
          clipPath="url(#face-clip)"
          preserveAspectRatio="xMidYMid slice"
          opacity="0.65"
        />
      )}

      {/* ── Face outline ─────────────────────────────────────────────────── */}
      {/* Outer face shape */}
      <ellipse
        cx="100" cy="138"
        rx="76" ry="100"
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />
      {/* Jawline indent */}
      <path
        d="M 44 195 Q 60 250 100 262 Q 140 250 156 195"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
      {/* Ear left */}
      <path
        d="M 24 120 Q 12 135 12 150 Q 12 165 24 168"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
      {/* Ear right */}
      <path
        d="M 176 120 Q 188 135 188 150 Q 188 165 176 168"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
      {/* Nose hint */}
      <path
        d="M 94 130 L 90 158 Q 100 164 110 158 L 106 130"
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Left eye hint */}
      <path
        d="M 50 112 Q 64 105 78 112 Q 64 119 50 112 Z"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
      {/* Right eye hint */}
      <path
        d="M 122 112 Q 136 105 150 112 Q 136 119 122 112 Z"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
      {/* Mouth hint */}
      <path
        d="M 82 178 Q 100 190 118 178"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Eyebrow left hint */}
      <path
        d="M 48 94 Q 64 88 78 92"
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Eyebrow right hint */}
      <path
        d="M 122 92 Q 136 88 152 94"
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* ── Hotspot pins ──────────────────────────────────────────────────── */}
      {pins.map((pin, i) => {
        const pos = HOTSPOT_POSITIONS[pin.featureType];
        if (!pos) return null;
        const isActive = activeFeature === pin.featureType;
        const color = getFeatureColor(pin.featureType).solid;

        return (
          <motion.g
            key={pin.featureType}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: 0.3 + i * 0.12,
              type: 'spring',
              stiffness: 300,
              damping: 18,
            }}
            style={{ cursor: 'pointer' }}
            onClick={() => onFeatureClick(pin.featureType)}
            aria-label={`${pos.label}: ${Math.round(pin.similarity * 100)}% match`}
            role="button"
          >
            {/* Outer pulse ring (active only) */}
            {isActive && (
              <motion.circle
                cx={pos.x} cy={pos.y} r={14}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                initial={{ opacity: 0.8, scale: 1 }}
                animate={{ opacity: 0, scale: 2 }}
                transition={{ repeat: Infinity, duration: 1.4, ease: 'easeOut' }}
              />
            )}

            {/* Glow ring */}
            <circle
              cx={pos.x} cy={pos.y} r={isActive ? 11 : 9}
              fill={`${color}22`}
              stroke={color}
              strokeWidth={isActive ? 2 : 1.5}
              style={{
                filter: `drop-shadow(0 0 ${isActive ? 8 : 4}px ${color})`,
                transition: 'r 0.2s, stroke-width 0.2s',
              }}
            />

            {/* Inner dot */}
            <circle
              cx={pos.x} cy={pos.y} r={3.5}
              fill={color}
              style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            />

            {/* Similarity % label (always visible) */}
            <text
              x={pos.x}
              y={pos.y - 15}
              textAnchor="middle"
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
              fill={color}
              style={{ pointerEvents: 'none' }}
            >
              {Math.round(pin.similarity * 100)}%
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
