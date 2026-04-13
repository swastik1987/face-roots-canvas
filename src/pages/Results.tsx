import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

const features = [
  { name: 'Eyes', pct: '82%', relative: 'Mom' },
  { name: 'Nose', pct: '67%', relative: 'Dad' },
  { name: 'Mouth', pct: '91%', relative: 'Grandma' },
  { name: 'Jawline', pct: '74%', relative: 'Dad' },
  { name: 'Eyebrows', pct: '88%', relative: 'Mom' },
  { name: 'Hairline', pct: '56%', relative: 'Grandpa' },
];

const Results = () => (
  <div className="flex flex-col items-center min-h-screen px-6 pt-12 gap-8">
    <motion.h1
      className="text-2xl font-bold gradient-text"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={spring}
    >
      Your Family DNA Map
    </motion.h1>

    <motion.div
      className="glass-card w-28 h-28 rounded-full flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring, delay: 0.1 }}
    >
      <User size={48} className="text-muted-foreground" />
    </motion.div>

    <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
      {features.map((f, i) => (
        <motion.div
          key={f.name}
          className="glass-card p-4 space-y-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.15 + i * 0.05 }}
        >
          <p className="text-sm text-muted-foreground">{f.name}</p>
          <p className="text-2xl font-bold font-mono gradient-text">{f.pct}</p>
          <Badge variant="secondary" className="text-xs">{f.relative}</Badge>
        </motion.div>
      ))}
    </div>

    <p className="text-xs text-muted-foreground text-center max-w-xs mt-4">
      Fun resemblance analysis — not a genetic or paternity test.
    </p>
  </div>
);

export default Results;
