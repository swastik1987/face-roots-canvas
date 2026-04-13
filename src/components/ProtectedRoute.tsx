import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useConsent } from '@/hooks/useConsent';

/**
 * Wraps routes that require:
 *  1. An authenticated session  → redirects to /auth
 *  2. A consent record          → redirects to /consent
 *
 * Shows nothing while loading to avoid flash redirects.
 */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const hasConsented = useConsent();

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (hasConsented === null) return null; // still fetching consent
  if (!hasConsented) return <Navigate to="/consent" replace />;

  return <Outlet />;
}

/**
 * Wraps routes that only require auth (no consent check).
 * Used for the /consent route itself.
 */
export function AuthRequiredRoute() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return <Outlet />;
}
