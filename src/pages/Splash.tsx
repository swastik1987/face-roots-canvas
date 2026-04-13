import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ScanFace, Sparkles, Share2, ArrowRight, GitCompare } from 'lucide-react';
import Wordmark from '@/components/brand/Wordmark';

const spring = { type: 'spring' as const, stiffness: 260, damping: 22 };

const STEPS = [
  {
    icon: ScanFace,
    title: 'Capture your face',
    desc: 'Take 3 quick angles with your camera. We detect 478 facial landmarks automatically.',
  },
  {
    icon: GitCompare,
    title: 'Add family members',
    desc: 'Upload photos of parents, grandparents, siblings — anyone you want to compare against.',
  },
  {
    icon: Sparkles,
    title: 'Discover your DNA map',
    desc: 'See exactly which facial features you inherited from which relative, feature by feature.',
  },
];

const FEATURES = [
  { stat: '478', label: 'landmarks tracked per face' },
  { stat: '12',  label: 'facial features analysed' },
  { stat: '100%', label: 'private — stays on your device' },
];

const Splash = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center gap-6 radial-glow overflow-hidden">
        {/* background circles */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan/5 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-fuchsia-500/5 blur-3xl pointer-events-none" />

        <motion.div
          className="flex flex-col items-center gap-2"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
        >
          <Wordmark />
          <p className="text-base font-semibold text-fuchsia-400 tracking-wide mt-1">
            Now you know who to blame.
          </p>
        </motion.div>

        <motion.p
          className="text-muted-foreground text-lg max-w-sm leading-relaxed"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.12 }}
        >
          Upload family portraits and discover which facial features you inherited — and exactly
          which relative to credit (or blame).
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-3 items-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.22 }}
        >
          <motion.button
            className="btn-gradient px-8 py-3.5 text-base font-semibold flex items-center gap-2"
            onClick={() => navigate('/auth')}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            Blame someone <ArrowRight size={18} />
          </motion.button>
          <button
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            onClick={() => navigate('/auth')}
          >
            Sign in
          </button>
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="flex gap-6 mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {FEATURES.map(f => (
            <div key={f.stat} className="flex flex-col items-center gap-0.5">
              <span className="text-xl font-bold gradient-text">{f.stat}</span>
              <span className="text-xs text-muted-foreground text-center leading-tight max-w-[72px]">{f.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-muted-foreground/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <motion.div
            className="w-0.5 h-8 bg-gradient-to-b from-white/20 to-transparent rounded-full"
            animate={{ scaleY: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          />
          <span className="text-xs">scroll</span>
        </motion.div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 flex flex-col items-center gap-12">
        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={spring}
        >
          <h2 className="text-2xl font-bold gradient-text">How it works</h2>
          <p className="text-muted-foreground text-sm max-w-xs">Three steps to pin the blame on your parents.</p>
        </motion.div>

        <div className="w-full max-w-sm space-y-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                className="glass-card p-5 flex gap-4 items-start"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: i * 0.1 }}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-cyan/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center">
                  <Icon size={20} className="text-cyan" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground/60">0{i + 1}</span>
                    <p className="text-sm font-semibold">{step.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── Sample results teaser ────────────────────────────────────────────── */}
      <section className="px-6 pb-16 flex flex-col items-center gap-8">
        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={spring}
        >
          <h2 className="text-2xl font-bold gradient-text">What you'll discover</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            A feature-by-feature breakdown of your face — with visual proof.
          </p>
        </motion.div>

        {/* Mock result cards */}
        <div className="w-full max-w-sm space-y-3">
          {[
            { feature: 'Nose',    person: 'Dad',    pct: 87, color: 'from-cyan to-blue-400' },
            { feature: 'Eyes',    person: 'Mum',    pct: 79, color: 'from-fuchsia-500 to-purple-500' },
            { feature: 'Jawline', person: 'Grandpa', pct: 72, color: 'from-amber-400 to-orange-500' },
          ].map((row, i) => (
            <motion.div
              key={row.feature}
              className="glass-card p-4 space-y-2"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...spring, delay: i * 0.08 }}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{row.feature}</span>
                <span className="text-muted-foreground text-xs">You got it from <span className="text-foreground font-medium">{row.person}</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${row.color}`}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${row.pct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{row.pct}% similarity</p>
            </motion.div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/50 italic text-center max-w-xs">
          Illustrative sample — your actual results will vary.
        </p>
      </section>

      {/* ── Share teaser ────────────────────────────────────────────────────── */}
      <section className="px-6 pb-16 flex flex-col items-center gap-6">
        <motion.div
          className="glass-card p-6 w-full max-w-sm text-center space-y-3 border-cyan/20"
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={spring}
        >
          <Share2 size={28} className="text-cyan mx-auto" />
          <h3 className="font-bold text-base">Share your DNA map</h3>
          <p className="text-sm text-muted-foreground">
            Export a beautiful share card and let your family debate who the blame really belongs to.
          </p>
        </motion.div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────────────────────────── */}
      <section className="px-6 pb-24 flex flex-col items-center gap-4 text-center">
        <motion.h2
          className="text-2xl font-bold"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={spring}
        >
          Ready to find out?
        </motion.h2>
        <motion.p
          className="text-muted-foreground text-sm max-w-xs"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ ...spring, delay: 0.1 }}
        >
          Free to use. No credit card. Just a family and a camera.
        </motion.p>
        <motion.button
          className="btn-gradient px-8 py-3.5 text-base font-semibold flex items-center gap-2 mt-2"
          onClick={() => navigate('/auth')}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ...spring, delay: 0.2 }}
        >
          Get started free <ArrowRight size={18} />
        </motion.button>
        <p className="text-xs text-muted-foreground">
          Fun visual resemblance tool. Not a genetic or paternity test.
        </p>
      </section>
    </div>
  );
};

export default Splash;
