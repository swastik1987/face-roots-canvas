import { Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ConsentModal } from '@/components/consent/ConsentModal';
import { useAuth } from '@/contexts/AuthContext';
import { useConsent } from '@/hooks/useConsent';

/**
 * /consent route — shown after first login.
 * If the user already has consent, skip to /home.
 */
const Consent = () => {
  const { user, loading } = useAuth();
  const hasConsented = useConsent();
  const navigate = useNavigate();

  const isLoading = loading || hasConsented === null;
  if (!isLoading) {
    if (!user) return <Navigate to="/auth" replace />;
    if (hasConsented) return <Navigate to="/home" replace />;
  }

  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div
          key="consent-loading"
          className="flex min-h-screen items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div className="w-10 h-10 rounded-full border-2 border-cyan/30 border-t-cyan motion-safe:animate-spin" />
        </motion.div>
      ) : (
        <motion.div
          key="consent-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16 }}
        >
          <ConsentModal onGranted={() => navigate('/home', { replace: true })} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Consent;
