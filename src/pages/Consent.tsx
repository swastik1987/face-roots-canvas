import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

const toggles = [
  { id: 'embeddings', label: 'Store my face embeddings (required)', defaultChecked: true },
  { id: 'photos', label: 'Keep my original photos for 7 days', defaultChecked: false },
  { id: 'sharing', label: 'Allow sharing my results', defaultChecked: false },
];

const Consent = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <motion.div
        className="glass-card p-8 w-full max-w-sm space-y-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
      >
        <h1 className="text-2xl font-bold text-center">Your privacy, your control</h1>

        <div className="space-y-5">
          {toggles.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <Label htmlFor={t.id} className="text-sm leading-snug">{t.label}</Label>
              <Switch id={t.id} defaultChecked={t.defaultChecked} />
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          FaceRoots is a fun visual resemblance tool. It is not a genetic, paternity, or ancestry test and must not be used for any legal, medical, or identity purpose.
        </p>

        <button
          className="btn-gradient w-full py-3"
          onClick={() => navigate('/home')}
        >
          Agree and continue
        </button>
      </motion.div>
    </div>
  );
};

export default Consent;
