import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, User } from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

const slots = ['Add Mom', 'Add Dad', 'Add Grandparent', 'Add Sibling'];

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-12 gap-8">
      <motion.h1
        className="text-2xl font-bold"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={spring}
      >
        Your family
      </motion.h1>

      <motion.div
        className="w-24 h-24 rounded-full bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring, delay: 0.1 }}
      >
        <User size={36} className="text-muted-foreground" />
      </motion.div>
      <span className="text-sm text-muted-foreground -mt-4">You</span>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {slots.map((label, i) => (
          <motion.button
            key={label}
            className="glass-card p-6 flex flex-col items-center gap-2 hover:bg-white/10 transition-colors"
            onClick={() => navigate('/family/add')}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.15 + i * 0.05 }}
          >
            <Plus size={24} className="text-cyan" />
            <span className="text-sm text-muted-foreground">{label}</span>
          </motion.button>
        ))}
      </div>

      <motion.button
        className="btn-gradient px-8 py-3 text-base mt-4"
        onClick={() => navigate('/capture')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring, delay: 0.4 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
      >
        Discover your Family DNA
      </motion.button>
    </div>
  );
};

export default Home;
