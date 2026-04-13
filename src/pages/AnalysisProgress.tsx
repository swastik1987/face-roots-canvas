/**
 * /analysis/:id — subscribes to Supabase Realtime for live pipeline status.
 *
 * When status reaches 'done'  → navigates to /results/:id
 * When status reaches 'failed' → shows error with retry CTA
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { supabase, type Analysis } from '@/lib/supabase';

type Status = Analysis['status'];

const STATUS_LABELS: Record<Status, string> = {
  pending:   'Getting ready…',
  embedding: 'Reading your features…',
  matching:  'Comparing with your family…',
  narrating: 'Asking the ancestors…',
  rendering: 'Painting your DNA map…',
  done:      'All done!',
  failed:    'Something went wrong.',
};

const STATUS_ORDER: Status[] = [
  'pending', 'embedding', 'matching', 'narrating', 'rendering', 'done',
];

function progressFraction(status: Status): number {
  const idx = STATUS_ORDER.indexOf(status);
  if (idx === -1) return 0;
  return (idx + 1) / STATUS_ORDER.length;
}

const AnalysisProgress = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!id) return;

    // Initial fetch
    supabase
      .from('analyses')
      .select('status, error_message')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          setStatus(data.status as Status);
          if (data.error_message) setErrorMessage(data.error_message);
        }
      });

    // Realtime subscription
    const channel = supabase
      .channel(`analysis-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'analyses',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as Partial<Analysis>;
          if (updated.status) setStatus(updated.status);
          if (updated.error_message) setErrorMessage(updated.error_message ?? null);
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [id]);

  // Navigate when done
  useEffect(() => {
    if (status === 'done' && id) {
      // Short delay so the user sees "All done!" before redirecting
      const t = setTimeout(() => navigate(`/results/${id}`, { replace: true }), 1200);
      return () => clearTimeout(t);
    }
  }, [status, id, navigate]);

  const isFailed = status === 'failed';
  const progress = isFailed ? 0 : progressFraction(status);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 gap-10">
      {/* Animated ring */}
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="44"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="8"
          />
          <motion.circle
            cx="50" cy="50" r="44"
            fill="none"
            stroke={isFailed ? '#ef4444' : '#22d3ee'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 44}
            animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - progress) }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          />
        </svg>

        {/* Inner spinner (only while running) */}
        {!isFailed && status !== 'done' && (
          <motion.div
            className="absolute inset-4 rounded-full border-2 border-cyan/30 border-t-cyan"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          />
        )}

        {/* Done checkmark */}
        {status === 'done' && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center text-cyan text-3xl"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            ✓
          </motion.div>
        )}

        {/* Failed icon */}
        {isFailed && (
          <div className="absolute inset-0 flex items-center justify-center text-destructive">
            <AlertCircle size={36} />
          </div>
        )}
      </div>

      {/* Status label */}
      <AnimatePresence mode="wait">
        <motion.p
          key={status}
          className={`text-lg font-medium text-center ${isFailed ? 'text-destructive' : 'text-foreground'}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {STATUS_LABELS[status]}
        </motion.p>
      </AnimatePresence>

      {/* Step pills */}
      <div className="flex gap-2 flex-wrap justify-center">
        {STATUS_ORDER.filter(s => s !== 'done').map((s) => {
          const idx = STATUS_ORDER.indexOf(s);
          const currentIdx = STATUS_ORDER.indexOf(status);
          const done = idx < currentIdx;
          const active = idx === currentIdx;

          return (
            <motion.span
              key={s}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                done
                  ? 'bg-cyan/20 text-cyan'
                  : active
                  ? 'bg-cyan/40 text-cyan ring-1 ring-cyan/60'
                  : 'bg-white/5 text-muted-foreground'
              }`}
              layout
            >
              {STATUS_LABELS[s].replace('…', '')}
            </motion.span>
          );
        })}
      </div>

      {/* Error detail + retry */}
      {isFailed && (
        <motion.div
          className="flex flex-col items-center gap-4 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {errorMessage && (
            <p className="text-sm text-muted-foreground max-w-xs">{errorMessage}</p>
          )}
          <button
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition-colors text-sm font-medium"
            onClick={() => navigate('/home', { replace: true })}
          >
            <RefreshCw size={14} />
            Try again from Home
          </button>
        </motion.div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground text-center max-w-xs">
        Fun resemblance analysis — not a genetic or paternity test.
      </p>
    </div>
  );
};

export default AnalysisProgress;
