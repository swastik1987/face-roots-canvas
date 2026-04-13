import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const messages = [
  'Finding your features…',
  'Comparing with your family…',
  'Asking the ancestors…',
];

const AnalysisProgress = () => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setIdx(i => (i + 1) % messages.length), 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 gap-8">
      <motion.div
        className="w-20 h-20 rounded-full border-[3px] border-cyan border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
      />
      <motion.p
        key={idx}
        className="text-lg text-muted-foreground"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
      >
        {messages[idx]}
      </motion.p>
    </div>
  );
};

export default AnalysisProgress;
