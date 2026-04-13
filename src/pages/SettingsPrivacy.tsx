import { motion } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

const toggles = [
  { id: 'embeddings', label: 'Store my face embeddings' },
  { id: 'photos', label: 'Keep my original photos' },
  { id: 'sharing', label: 'Allow sharing my results' },
];

const radioOptions = ['1 day', '7 days', 'Until I delete them'];

const SettingsPrivacy = () => (
  <div className="flex flex-col min-h-screen px-6 pt-12 gap-6">
    <motion.h1
      className="text-2xl font-bold"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={spring}
    >
      Privacy
    </motion.h1>

    <motion.div
      className="glass-card p-6 space-y-5"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring}
    >
      {toggles.map(t => (
        <div key={t.id} className="flex items-center justify-between gap-3">
          <Label htmlFor={t.id} className="text-sm">{t.label}</Label>
          <Switch id={t.id} />
        </div>
      ))}
    </motion.div>

    <motion.div
      className="glass-card p-6 space-y-4"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring, delay: 0.1 }}
    >
      <p className="text-sm font-medium">Keep raw photos for:</p>
      <div className="space-y-3">
        {radioOptions.map((opt, i) => (
          <label key={opt} className="flex items-center gap-3 cursor-pointer">
            <div className={`w-4 h-4 rounded-full border-2 ${i === 1 ? 'border-cyan bg-cyan' : 'border-white/30'}`} />
            <span className="text-sm text-secondary-foreground">{opt}</span>
          </label>
        ))}
      </div>
    </motion.div>
  </div>
);

export default SettingsPrivacy;
