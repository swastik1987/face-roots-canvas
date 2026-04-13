import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Wordmark from '@/components/brand/Wordmark';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

const Splash = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center gap-8">
      <Wordmark />
      <motion.p
        className="text-muted-foreground text-lg max-w-xs"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.15 }}
      >
        Discover where your face comes from
      </motion.p>
      <motion.button
        className="btn-gradient px-8 py-3 text-base"
        onClick={() => navigate('/auth')}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.3 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
      >
        Get started
      </motion.button>
    </div>
  );
};

export default Splash;
