import { motion } from 'framer-motion';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };
const steps = ['Front', 'Left', 'Right'];

const Capture = () => (
  <div className="flex flex-col items-center justify-between min-h-screen px-6 py-12">
    <motion.div
      className="flex gap-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={spring}
    >
      {steps.map((s, i) => (
        <span
          key={s}
          className={`text-sm font-medium ${i === 0 ? 'text-cyan' : 'text-muted-foreground'}`}
        >
          {s}
        </span>
      ))}
    </motion.div>

    <motion.div
      className="w-64 h-80 rounded-[50%] border-2 border-dashed border-cyan/40 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring, delay: 0.1 }}
    >
      <p className="text-sm text-muted-foreground text-center px-8">
        Position your face inside the oval
      </p>
    </motion.div>

    <motion.button
      className="btn-gradient px-10 py-3 text-base"
      onClick={() => console.log('TODO: capture')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...spring, delay: 0.25 }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
    >
      Capture
    </motion.button>
  </div>
);

export default Capture;
