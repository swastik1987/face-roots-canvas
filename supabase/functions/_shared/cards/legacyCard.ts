/**
 * LegacyCard — Satori element tree for the 1080×1920 share card.
 *
 * Satori accepts React-element-like plain objects (type + props).
 * No React import required; we construct the tree manually.
 *
 * Design:
 *   ┌─────────────────────────────────────────┐
 *   │  FaceRoots wordmark + tagline           │
 *   │  ────────────────────────────────────── │
 *   │       [ self face avatar, 360×360 ]     │
 *   │  ────────────────────────────────────── │
 *   │     ── Your Family DNA Map ──           │
 *   │                                         │
 *   │  Feature          Person       82% ████ │
 *   │  Feature          Person       74% ████ │
 *   │  … (up to 6 rows)                       │
 *   │                                         │
 *   │  Fun resemblance analysis — not a test  │
 *   │  Made with FaceRoots   (free only)      │
 *   └─────────────────────────────────────────┘
 */

export interface CardMatch {
  featureType: string;
  winnerName: string;
  relationship: string;
  similarity: number; // 0..1
}

export interface CardData {
  selfName: string;
  selfImageB64: string | null; // jpeg base64 or null
  matches: CardMatch[];        // sorted desc by similarity, max 6
  isPro: boolean;
}

const CYAN    = '#06b6d4';
const MAGENTA = '#d946ef';
const BG      = '#0a0a0f';

/** Convert snake_case feature type to display label. */
function formatFeature(type: string | null | undefined): string {
  if (!type) return 'Feature';
  return type
    .replace(/_left|_right/g, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Similarity bar: colored fill + right-aligned % label. */
function simBar(sim: number): object {
  const pct = Math.round(sim * 100);
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        flexShrink: 0,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              width: 140,
              height: 8,
              borderRadius: 4,
              background: 'rgba(255,255,255,0.10)',
              display: 'flex',
              overflow: 'hidden',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  width: `${pct}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${CYAN}, ${MAGENTA})`,
                  borderRadius: 4,
                  display: 'flex',
                },
              },
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              fontSize: 30,
              fontWeight: 700,
              color: '#ffffff',
              width: 72,
              textAlign: 'right',
            },
            children: `${pct}%`,
          },
        },
      ],
    },
  };
}

/** One match row. */
function matchRow(m: CardMatch, idx: number): object {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '22px 40px',
        background: idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
        borderRadius: 20,
      },
      children: [
        // Left: feature + person name
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 30,
                    fontWeight: 600,
                    color: '#ffffff',
                  },
                  children: formatFeature(m.featureType),
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 24,
                    color: 'rgba(255,255,255,0.50)',
                    marginTop: 6,
                  },
                  children: `like ${m.winnerName || 'family'}`,
                },
              },
            ],
          },
        },
        // Right: similarity bar
        simBar(m.similarity),
      ],
    },
  };
}

/** Decorative glow blob (absolute-positioned). */
function glowBlob(opts: {
  top?: number; bottom?: number;
  left?: number; right?: number;
  color: string;
  size: number;
}): object {
  const style: Record<string, string | number> = {
    position: 'absolute',
    width: opts.size,
    height: opts.size,
    borderRadius: '50%',
    background: opts.color,
    display: 'flex',
  };

  if (opts.top != null) style.top = opts.top;
  if (opts.bottom != null) style.bottom = opts.bottom;
  if (opts.left != null) style.left = opts.left;
  if (opts.right != null) style.right = opts.right;

  return {
    type: 'div',
    props: {
      style,
    },
  };
}

/** Build the full Satori element tree for the Legacy Card. */
export function buildLegacyCard(data: CardData): object {
  const { selfName, selfImageB64, matches, isPro } = data;
  const topSix = matches.slice(0, 6);

  // ── Self avatar ────────────────────────────────────────────────────────────
  const avatarInner = selfImageB64
    ? {
        type: 'img',
        props: {
          src: `data:image/jpeg;base64,${selfImageB64}`,
          style: {
            width: 360,
            height: 360,
            objectFit: 'cover',
            borderRadius: '50%',
          },
        },
      }
    : {
        // Placeholder: initials on gradient bg
        type: 'div',
        props: {
          style: {
            width: 360,
            height: 360,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${CYAN}55, ${MAGENTA}55)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
          children: {
            type: 'div',
            props: {
              style: {
                fontSize: 140,
                fontWeight: 800,
                color: 'rgba(255,255,255,0.80)',
              },
              children: (selfName || 'Y').charAt(0).toUpperCase(),
            },
          },
        },
      };

  // ── Divider line ───────────────────────────────────────────────────────────
  const divider = {
    type: 'div',
    props: {
      style: {
        height: 1,
        background: 'rgba(255,255,255,0.08)',
        width: '100%',
        display: 'flex',
      },
    },
  };

  // ── Full card ──────────────────────────────────────────────────────────────
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        width: 1080,
        height: 1920,
        background: BG,
        fontFamily: 'Inter',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      },
      children: [
        // Decorative glow blobs
        glowBlob({ top: -240, left: -240, color: `${CYAN}1a`, size: 700 }),
        glowBlob({ bottom: -240, right: -240, color: `${MAGENTA}1a`, size: 700 }),

        // ── Header ───────────────────────────────────────────────────────────
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: 100,
              paddingBottom: 56,
              paddingLeft: 48,
              paddingRight: 48,
            },
            children: [
              // Wordmark
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 72,
                    fontWeight: 800,
                    color: CYAN,
                    letterSpacing: '-2px',
                  },
                  children: 'FaceRoots',
                },
              },
              // Tagline
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 30,
                    color: 'rgba(255,255,255,0.50)',
                    marginTop: 14,
                    textAlign: 'center',
                  },
                  children: 'Discover where your face comes from.',
                },
              },
            ],
          },
        },

        divider,

        // ── Face avatar ───────────────────────────────────────────────────────
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              paddingTop: 64,
              paddingBottom: 64,
            },
            children: {
              // Glowing ring around avatar
              type: 'div',
              props: {
                style: {
                  width: 400,
                  height: 400,
                  borderRadius: '50%',
                  border: `3px solid ${CYAN}66`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                },
                children: avatarInner,
              },
            },
          },
        },

        divider,

        // ── Section headline ──────────────────────────────────────────────────
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 20,
              paddingTop: 52,
              paddingBottom: 36,
              paddingLeft: 48,
              paddingRight: 48,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    height: 2,
                    flex: 1,
                    background: `linear-gradient(90deg, transparent, ${CYAN}66)`,
                    display: 'flex',
                  },
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 40,
                    fontWeight: 700,
                    color: '#ffffff',
                  },
                  children: 'Your Family DNA Map',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    height: 2,
                    flex: 1,
                    background: `linear-gradient(90deg, ${MAGENTA}66, transparent)`,
                    display: 'flex',
                  },
                },
              },
            ],
          },
        },

        // ── Match rows ────────────────────────────────────────────────────────
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              paddingLeft: 40,
              paddingRight: 40,
              flex: 1,
            },
            children: topSix.map((m, i) => matchRow(m, i)),
          },
        },

        // ── Footer ────────────────────────────────────────────────────────────
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
              paddingTop: 40,
              paddingBottom: isPro ? 80 : 48,
              paddingLeft: 64,
              paddingRight: 64,
              borderTop: '1px solid rgba(255,255,255,0.08)',
            },
            children: [
              // Disclaimer
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 24,
                    color: 'rgba(255,255,255,0.30)',
                    textAlign: 'center',
                    lineHeight: 1.6,
                  },
                  children:
                    'Fun resemblance analysis \u2014 not a genetic or paternity test.',
                },
              },
              // Free-tier watermark
              ...(isPro
                ? []
                : [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 26,
                          fontWeight: 600,
                          color: `${CYAN}bb`,
                        },
                        children: 'Made with FaceRoots',
                      },
                    },
                  ]),
            ],
          },
        },
      ],
    },
  };
}
