import { Navigate, useNavigate } from 'react-router-dom';
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

  if (loading || hasConsented === null) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (hasConsented) return <Navigate to="/home" replace />;

  return <ConsentModal onGranted={() => navigate('/home', { replace: true })} />;
};

export default Consent;
