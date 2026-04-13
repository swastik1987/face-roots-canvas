import { motion } from 'framer-motion';

const Wordmark = ({ className = '' }: { className?: string }) => (
  <motion.h1
    className={`text-5xl font-extrabold tracking-tight gradient-text ${className}`}
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
  >
    FaceBlame
  </motion.h1>
);

export default Wordmark;
