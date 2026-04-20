/**
 * /analysis/:id — subscribes to Supabase Realtime for live pipeline status.
 *
 * When status reaches 'done'  → navigates to /results/:id
 * When status reaches 'failed' → shows error with retry CTA
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, RefreshCw, Clock } from 'lucide-react';
import { supabase, type Analysis } from '@/lib/supabase';
import { captureEvent } from '@/lib/analytics';

type Status = Analysis['status'];

const SLOW_THRESHOLD_MS = 90_000;

const PILL_LABELS: Record<Exclude<Status, 'done' | 'failed'>, string> = {
  pending:   'Queued',
  embedding: 'Reading',
  matching:  'Matching',
  narrating: 'Narrating',
  rendering: 'Rendering',
};

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
  const [slow, setSlow] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchStatus = () =>
      supabase
        .from('analyses')
        .select('status, error_message')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (data) {
            setStatus(data.status as Status);
            if (data.error_message) setErrorMessage(data.error_message);
            // Stop polling once we reach a terminal state
            if (data.status === 'done' || data.status === 'failed') {
              if (pollRef.current) clearInterval(pollRef.current);
            }
          }
        });

    // Initial fetch
    fetchStatus();

    // Poll every 4s as a fallback in case Realtime misses an update
    const poll = setInterval(fetchStatus, 4000);
    pollRef.current = poll;

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
    return () => {
      clearInterval(poll);
      channel.unsubscribe();
    };
  }, [id]);

  // Fire analytics + navigate when done
  useEffect(() => {
    if (status === 'done' && id) {
      captureEvent('analysis_done', { analysis_id: id });
      const t = setTimeout(() => navigate(`/results/${id}`, { replace: true }), 1200);
      return () => clearTimeout(t);
    }
  }, [status, id, navigate]);

  // Soft timeout: show "taking longer than usual" after 90s
  useEffect(() => {
    if (status === 'done' || status === 'failed') return;
    const t = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS);
    return () => clearTimeout(t);
  }, [status]);

  const isFailed = status === 'failed';
  const progress = isFailed ? 0 : progressFraction(status);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 gap-10">
      {/* Animated ring */}
      <div className="relative w-28 h-28" role="img" aria-label={`Analysis progress ${Math.round(progress * 100)}%`}>
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
      <div aria-live="polite" aria-atomic="true" className="text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={status}
            className={`text-lg font-medium ${isFailed ? 'text-destructive' : 'text-foreground'}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {STATUS_LABELS[status]}
          </motion.p>
        </AnimatePresence>
        {!isFailed && status !== 'done' && (
          <p className="mt-1 text-xs text-muted-foreground">Usually takes about 30 seconds</p>
        )}
      </div>

      {/* Step pills */}
      <div className="flex gap-2 flex-wrap justify-center">
        {STATUS_ORDER.filter((s): s is Exclude<Status, 'done' | 'failed'> => s !== 'done').map((s) => {
          const idx = STATUS_ORDER.indexOf(s);
          const currentIdx = STATUS_ORDER.indexOf(status);
          const done = idx < currentIdx;
          const active = idx === currentIdx && !isFailed;

          return (
            <span
              key={s}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                done
                  ? 'bg-cyan/20 text-cyan'
                  : active
                  ? 'bg-gradient-to-r from-cyan/40 via-magenta/40 to-cyan/40 text-white ring-1 ring-cyan/60 motion-safe:animate-gradient-travel'
                  : 'bg-white/5 text-muted-foreground'
              }`}
            >
              {PILL_LABELS[s]}
            </span>
          );
        })}
      </div>

      {/* Slow banner */}
      {slow && !isFailed && status !== 'done' && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card px-4 py-3 flex items-start gap-3 max-w-xs text-left"
          role="status"
        >
          <Clock size={16} className="text-cyan shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Taking a bit longer than usual</p>
            <p className="text-xs text-muted-foreground mt-0.5">Hang tight — we're still working on your map.</p>
          </div>
        </motion.div>
      )}

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
