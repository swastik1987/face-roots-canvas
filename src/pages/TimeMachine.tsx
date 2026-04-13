/**
 * /time-machine — Time Machine placeholder (Phase 7).
 *
 * Concept: upload a photo of a grandparent at age 20 and see which features
 * were passed down across generations.
 *
 * v1 is a teaser only. Full implementation is deferred to Phase 9.
 */
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, ArrowLeft } from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 260, damping: 22 };

const TEASER_STEPS = [
  {
    step: '01',
    label: 'Upload a vintage photo',
    desc: 'Add a photo of an ancestor — grandparent, great-grandparent, or older.',
  },
  {
    step: '02',
    label: 'Cross-generation matching',
    desc: 'FaceBlame maps features across decades to find inherited traits.',
  },
  {
    step: '03',
    label: 'Your genetic timeline',
    desc: 'See a visual lineage of which features travelled through generations to reach you.',
  },
];

export default function TimeMachine() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-6 text-center pb-28">
      {/* Icon */}
      <motion.div
        className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-white/10 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
      >
        <Clock size={36} className="text-amber-400" />
      </motion.div>

      {/* Heading */}
      <motion.div
        className="space-y-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
      >
        <h1 className="text-2xl font-bold gradient-text">Time Machine</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Travel back through generations and discover the ancient origins of your face.
        </p>
      </motion.div>

      {/* Step previews */}
      <motion.div
        className="w-full max-w-xs space-y-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring, delay: 0.2 }}
      >
        {TEASER_STEPS.map(({ step, label, desc }) => (
          <div
            key={step}
            className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 text-left"
          >
            <span className="text-xs font-mono text-amber-400/70 shrink-0 mt-0.5">{step}</span>
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Coming soon badge */}
      <motion.div
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-sm font-medium"
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
