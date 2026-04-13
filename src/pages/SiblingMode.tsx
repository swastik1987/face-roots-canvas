/**
 * /sibling — Sibling Mode stub (Phase 7).
 *
 * Data model: sibling_analyses table (migration 0007) links two self-persons
 * to the same parent pool and stores per-feature match deltas.
 *
 * v1 ships a "Coming soon" teaser only. Full implementation is deferred to
 * Phase 8 after the bias audit confirms embedding quality for this use case.
 */
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GitCompare, ArrowLeft } from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 260, damping: 22 };

export default function SiblingMode() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-6 text-center pb-28">
      {/* Icon */}
      <motion.div
        className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
      >
        <GitCompare size={36} className="text-cyan" />
      </motion.div>

      {/* Heading */}
      <motion.div
        className="space-y-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
      >
        <h1 className="text-2xl font-bold gradient-text">Sibling Mode</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Compare two people against the same parent pool — see who inherited what, side-by-side.
        </p>
      </motion.div>

      {/* Feature previews */}
      <motion.div
        className="w-full max-w-xs space-y-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring, delay: 0.2 }}
      >
        {[
          { label: 'Side-by-side DNA maps', desc: 'Compare two people\'s results at once' },
          { label: 'Feature delta view',     desc: 'See which features diverge between siblings' },
          { label: 'Shared vs unique',       desc: 'Highlight features both siblings share with a parent' },
        ].map(({ label, desc }) => (
          <div
            key={label}
            className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/10 text-left"
          >
            <div className="w-2 h-2 rounded-full bg-cyan mt-1.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Coming soon badge */}
      <motion.div
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 text-sm font-medium"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring, delay: 0.3 }}
      >
        Coming soon
      </motion.div>

      {/* Back */}
      <motion.button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => navigate('/home')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <ArrowLeft size={14} />
        Back to home
      </motion.button>
    </div>
  );
}
