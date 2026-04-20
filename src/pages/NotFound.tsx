import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Home } from 'lucide-react';
import EmptyIllustration from '@/components/ui/EmptyIllustration';

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="radial-glow absolute inset-0 pointer-events-none" aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <EmptyIllustration variant="notfound" className="w-56 h-44" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-5xl font-bold gradient-text font-mono"
      >
        404
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="max-w-xs text-muted-foreground"
      >
        This face didn't make the map. The page you're looking for doesn't exist or has been moved.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col sm:flex-row gap-3 mt-2"
      >
        <button
          onClick={() => navigate(-1)}
          className="focus-ring inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-white/8 hover:bg-white/12 border border-white/10 text-sm font-medium"
        >
          <ArrowLeft size={16} /> Go back
        </button>
        <button
          onClick={() => navigate('/home')}
          className="btn-gradient focus-ring inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm"
        >
          <Home size={16} /> Home
        </button>
      </motion.div>

      <p className="mt-6 text-xs text-muted-foreground/70 font-mono">
        {location.pathname}
      </p>
    </div>
  );
};

export default NotFound;
