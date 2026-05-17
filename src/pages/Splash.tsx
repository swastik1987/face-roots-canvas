import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ScanFace, Sparkles, Share2, ArrowRight, GitCompare, ShieldCheck } from "lucide-react";

const spring = { type: "spring" as const, stiffness: 260, damping: 22 };

const STEPS = [
  {
    icon: ScanFace,
    number: "01",
    title: "Capture your face",
    desc: "Take a quick portrait photo. We detect 478 facial landmarks automatically — no manual tagging needed.",
  },
  {
    icon: GitCompare,
    number: "02",
    title: "Add family members",
    desc: "Upload photos of parents, grandparents, siblings — anyone you want to compare against.",
  },
  {
    icon: Sparkles,
    number: "03",
    title: "Discover your DNA map",
    desc: "See exactly which facial features you inherited from which relative, feature by feature.",
  },
];

const FEATURES = [
  { stat: "478", label: "landmarks tracked per face" },
  { stat: "12", label: "facial features analysed" },
  { stat: "100%", label: "on your device" },
];

const PRIVACY_ITEMS = [
  "All analysis runs in your browser",
  "No face data sent to any server",
  "Delete your data any time",
];

const MOCK_RESULTS = [
  { feature: "Nose", person: "Dad", pct: 87, color: "from-cyan to-blue-400", youColor: "bg-cyan/80", relColor: "bg-blue-400/80" },
  { feature: "Eyes", person: "Mum", pct: 79, color: "from-fuchsia-500 to-purple-500", youColor: "bg-fuchsia-400/80", relColor: "bg-purple-500/80" },
  { feature: "Jawline", person: "Grandpa", pct: 72, color: "from-amber-400 to-orange-500", youColor: "bg-amber-400/80", relColor: "bg-orange-500/80" },
];

const Splash = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center gap-5 overflow-hidden">
        {/* Ambient glows */}
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-cyan/8 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-[480px] h-[480px] rounded-full bg-fuchsia-500/8 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-900/20 blur-3xl pointer-events-none" />

        {/* Logo image */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.82, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
        >
          {/* Glow behind logo */}
          <div className="absolute inset-0 -m-6 rounded-full bg-purple-500/20 blur-2xl pointer-events-none" />
          <img
            src="/logo-icon.png"
            alt="FaceBlame logo — a face made of two interlocking puzzle pieces"
            className="relative w-40 h-40 sm:w-52 sm:h-52 rounded-[2.5rem] shadow-2xl shadow-purple-900/60 z-10"
            draggable={false}
          />
        </motion.div>

        {/* Wordmark + tagline */}
        <motion.div
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.12 }}
        >
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight gradient-text">FaceBlame</h1>
          <p className="text-base font-semibold text-fuchsia-400 tracking-wide">Now you know who to blame.</p>
        </motion.div>

        {/* Description */}
        <motion.p
          className="text-muted-foreground text-base sm:text-lg max-w-sm leading-relaxed"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.2 }}
        >
          Upload family portraits and discover which facial features you inherited — and exactly which relative to
          credit (or blame).
        </motion.p>

        {/* Primary CTA */}
        <motion.button
          className="btn-gradient px-9 py-4 text-base font-semibold flex items-center gap-2 shadow-lg shadow-cyan/20"
          onClick={() => navigate("/auth")}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.28 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
        >
          Blame someone <ArrowRight size={18} />
        </motion.button>

        {/* Stats row */}
        <motion.div
          className="flex gap-8 mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.44 }}
        >
          {FEATURES.map((f) => (
            <div key={f.stat} className="flex flex-col items-center gap-0.5">
              <span className="text-2xl font-bold gradient-text">{f.stat}</span>
              <span className="text-[11px] text-muted-foreground text-center leading-tight max-w-[80px]">{f.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-muted-foreground/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
        >
          <motion.div
            className="w-0.5 h-8 bg-gradient-to-b from-white/20 to-transparent rounded-full"
            animate={{ scaleY: [1, 0.4, 1] }}
            transition={{ repeat: 6, duration: 1.8, ease: "easeInOut" }}
          />
          <span className="text-[10px] uppercase tracking-widest">scroll</span>
        </motion.div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 flex flex-col items-center gap-12">
        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={spring}
        >
          <h2 className="text-2xl sm:text-3xl font-bold gradient-text">How it works</h2>
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
                {/* Large gradient step number as the visual anchor */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
                  <span className="text-3xl font-black gradient-text leading-none">{step.number}</span>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan/15 to-fuchsia-500/15 border border-white/10 flex items-center justify-center">
                    <Icon size={16} className="text-cyan/80" />
                  </div>
                </div>
                <div className="space-y-1 pt-0.5">
                  <p className="text-sm font-bold">{step.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── What you'll discover ─────────────────────────────────────────────── */}
      <section className="px-6 pb-16 flex flex-col items-center gap-8">
        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={spring}
        >
          <h2 className="text-2xl sm:text-3xl font-bold gradient-text">What you'll discover</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            A feature-by-feature breakdown — with visual proof.
          </p>
        </motion.div>

        <div className="w-full max-w-sm space-y-3">
          {MOCK_RESULTS.map((row, i) => (
            <motion.div
              key={row.feature}
              className="glass-card p-4 space-y-3"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...spring, delay: i * 0.08 }}
            >
              {/* Header row: avatar circles + label */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Two overlapping avatar circles */}
                  <div className="flex -space-x-2">
                    <div className={`w-7 h-7 rounded-full ${row.youColor} border-2 border-background flex items-center justify-center text-[9px] font-bold text-background`}>
                      You
                    </div>
                    <div className={`w-7 h-7 rounded-full ${row.relColor} border-2 border-background flex items-center justify-center text-[9px] font-bold text-background`}>
                      {row.person[0]}
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{row.feature}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  from <span className="text-foreground font-medium">{row.person}</span>
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full bg-gradient-to-r ${row.color}`}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${row.pct}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.2 + i * 0.1, ease: "easeOut" }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{row.pct}% similarity</p>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/40 italic text-center max-w-xs">
          Illustrative sample — your actual results will vary.
        </p>
      </section>

      {/* ── Privacy trust strip ──────────────────────────────────────────────── */}
      <section className="px-6 pb-16 flex flex-col items-center">
        <motion.div
          className="glass-card w-full max-w-sm p-5 border-white/8"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={spring}
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={18} className="text-cyan shrink-0" />
            <p className="text-sm font-semibold">Your privacy, guaranteed</p>
          </div>
          <ul className="space-y-2">
            {PRIVACY_ITEMS.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-1 h-1 rounded-full bg-cyan shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────────────────────────── */}
      <section className="px-6 pb-24 flex flex-col items-center gap-5 text-center">
        {/* Share teaser merged into CTA block */}
        <motion.div
          className="glass-card p-6 w-full max-w-sm space-y-4 border-cyan/15"
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={spring}
        >
          <div className="flex justify-center">
            <Share2 size={26} className="text-cyan" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-base">Share your DNA map</h3>
            <p className="text-sm text-muted-foreground">
              Export a beautiful share card and let the whole family debate who the blame really belongs to.
            </p>
          </div>

          <div className="border-t border-white/8 pt-4 space-y-3">
            <h2 className="text-xl font-bold">Ready to find out?</h2>
            <p className="text-muted-foreground text-sm">Free to use. No credit card. Just a family and a camera.</p>
            <motion.button
              className="btn-gradient w-full py-3.5 text-base font-semibold flex items-center justify-center gap-2"
              onClick={() => navigate("/auth")}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Get started free <ArrowRight size={18} />
            </motion.button>
          </div>
        </motion.div>

        <p className="text-xs text-muted-foreground/40">Fun visual resemblance tool. Not a genetic or paternity test.</p>
      </section>
    </div>
  );
};

export default Splash;
