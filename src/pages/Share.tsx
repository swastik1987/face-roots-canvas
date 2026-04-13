import { motion } from 'framer-motion';
import { Download, Share2 } from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

const SharePage = () => (
  <div className="flex flex-col items-center justify-center min-h-screen px-6 gap-8">
    <motion.div
      className="w-64 h-[28rem] rounded-2xl bg-gradient-to-b from-cyan/20 to-magenta/20 border border-white/10 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring}
    >
      <p className="text-muted-foreground text-sm">Share card preview</p>
    </motion.div>

    <div className="flex gap-4">
      <button
        className="btn-gradient px-6 py-3 flex items-center gap-2"
        onClick={() => console.log('TODO: download')}
      >
        <Download size={18} /> Download
      </button>
      <button
        className="px-6 py-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-2"
        onClick={() => console.log('TODO: share')}
      >
        <Share2 size={18} /> Share
      </button>
    </div>
  </div>
);

export default SharePage;
