import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns whether the current user has an active 'granted' consent event.
 * Used to gate consent on first login.
 */
export function useConsent() {
  const { user } = useAuth();
  const [hasConsented, setHasConsented] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setHasConsented(null);
      return;
    }

    supabase
      .from('consent_events')
      .select('id')
      .eq('user_id', user.id)
      .eq('event_type', 'granted')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) {
          console.error('[useConsent]', error);
          setHasConsented(false);
          return;
        }
        setHasConsented((data?.length ?? 0) > 0);
      });
  }, [user]);

  return hasConsented;
}
