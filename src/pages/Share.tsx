/**
 * /results/:id/share — Legacy Card share page (Phase 5).
 *
 * Flow:
 *   1. Fetch analysis from DB to check card_storage_path
 *   2a. If card_storage_path exists → create a fresh 15-min signed URL
 *   2b. If not → invoke render-legacy-card Edge Function (may take ~10s)
 *   3. Show card preview + Download + Share buttons
 *
 * Download: fetches the PNG as a blob → triggers browser save dialog.
 * Share: uses Web Share API (with file share if supported), falls back
 *        to clipboard copy of the current URL.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share2, ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { captureEvent } from '@/lib/analytics';

type CardState =
  | { phase: 'loading' }
  | { phase: 'rendering'; message: string }
  | { phase: 'ready'; signedUrl: string }
  | { phase: 'error'; message: string };

const spring = { type: 'spring' as const, stiffness: 260, damping: 22 };

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [state, setState] = useState<CardState>({ phase: 'loading' });
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // ── Load or render the card ──────────────────────────────────────────────

  const loadCard = useCallback(async () => {
    if (!id) return;

    try {
      setState({ phase: 'loading' });

      // 1. Fetch analysis to check if card has already been rendered
      const { data: analysis, error: aErr } = await supabase
        .from('analyses')
        .select('id, status, card_storage_path')
        .eq('id', id)
        .single();

      if (aErr || !analysis) {
        setState({ phase: 'error', message: 'Analysis not found.' });
        return;
      }

      // 2a. Card already exists — create a fresh signed URL
      if (analysis.card_storage_path) {
        const { data: signed, error: sErr } = await supabase.storage
          .from('legacy-cards')
          .createSignedUrl(analysis.card_storage_path, 900);

        if (!sErr && signed?.signedUrl) {
          setState({ phase: 'ready', signedUrl: signed.signedUrl });
          return;
        }
        // Signed URL creation failed (file may have been deleted) — fall through to re-render
      }

      // 2b. Render on demand
      if (analysis.status !== 'done' && analysis.status !== 'rendering') {
        setState({
          phase: 'error',
          message: `Analysis isn't ready yet (status: ${analysis.status}).`,
        });
        return;
      }

      setState({ phase: 'rendering', message: 'Rendering your share card…' });

      const { data: fnData, error: fnErr } = await supabase.functions.invoke<{ signed_url: string }>(
        'render-legacy-card',
        { body: { analysis_id: id } },
      );

      if (fnErr || !fnData?.signed_url) {
        setState({
          phase: 'error',
          message: fnErr?.message ?? 'Card rendering failed. Please try again.',
        });
        return;
      }

      setState({ phase: 'ready', signedUrl: fnData.signed_url });
    } catch (err) {
      setState({ phase: 'error', message: (err as Error).message });
    }
  }, [id]);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  // ── Download ────────────────────────────────────────────────────────────

  const handleDownload = async () => {
    if (state.phase !== 'ready') return;
    captureEvent('share_clicked', { method: 'download', analysis_id: id });
    setIsDownloading(true);
    try {
      const res = await fetch(state.signedUrl);
      if (!res.ok) throw new Error('Could not fetch card image.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'faceroots-dna-map.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: 'Download failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Share (Web Share API) ────────────────────────────────────────────────

  const handleShare = async () => {
    if (state.phase !== 'ready') return;
    captureEvent('share_clicked', { method: 'native_share', analysis_id: id });
    setIsSharing(true);
    try {
      if (navigator.share) {
        // Try to share the actual file first
        try {
          const res = await fetch(state.signedUrl);
          const blob = await res.blob();
          const file = new File([blob], 'faceroots-dna-map.png', { type: 'image/png' });

          const shareData: ShareData = {
            title: 'My Family DNA Map',
            text: 'Check out my Family DNA Map — discover where my face comes from! 🌳',
            files: [file],
          };

          if (navigator.canShare?.(shareData)) {
            await navigator.share(shareData);
            return;
          }
        } catch {
          // File share failed; fall through to URL share
        }

        // URL-only share (fallback)
        await navigator.share({
          title: 'My Family DNA Map',
          text: 'Check out my Family DNA Map from FaceRoots!',
          url: window.location.href,
        });
      } else {
        // No Web Share API → copy URL to clipboard
        await navigator.clipboard.writeText(window.location.href);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2500);
        toast({ title: 'Link copied!', description: 'Share it anywhere you like.' });
      }
    } catch (err) {
      // User cancelled share — not an error
      if ((err as Error).name !== 'AbortError') {
        toast({ title: 'Share failed', description: (err as Error).message, variant: 'destructive' });
      }
    } finally {
      setIsSharing(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center min-h-screen pb-28">
      {/* Back button */}
      <div className="w-full max-w-sm px-4 pt-6 pb-2">
        <button
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => navigate(`/results/${id}`)}
        >
          <ArrowLeft size={15} />
          Back to results
        </button>
      </div>

      {/* Page title */}
      <motion.h1
        className="text-xl font-bold gradient-text mt-2 mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        Your Legacy Card
      </motion.h1>

      <AnimatePresence mode="wait">
        {/* ── Loading / Rendering ──────────────────────────────────────── */}
        {(state.phase === 'loading' || state.phase === 'rendering') && (
          <motion.div
            key="loading"
            className="flex flex-col items-center gap-4 px-6 mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Card skeleton */}
            <div className="w-56 h-[25rem] rounded-2xl bg-gradient-to-b from-cyan/10 to-magenta/10 border border-white/10 flex flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="animate-spin text-cyan" />
              <p className="text-xs text-muted-foreground text-center px-4">
                {state.phase === 'rendering' ? state.message : 'Loading your card…'}
              </p>
            </div>
            {state.phase === 'rendering' && (
              <p className="text-xs text-muted-foreground">This may take up to 15 seconds</p>
            )}
          </motion.div>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {state.phase === 'error' && (
          <motion.div
            key="error"
            className="flex flex-col items-center gap-4 px-6 mt-8"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <AlertCircle size={36} className="text-destructive" />
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {state.message}
            </p>
            <button
              className="btn-gradient px-6 py-2.5 text-sm mt-2"
              onClick={loadCard}
            >
              Try again
            </button>
          </motion.div>
        )}

        {/* ── Ready ─────────────────────────────────────────────────────── */}
        {state.phase === 'ready' && (
          <motion.div
            key="ready"
            className="flex flex-col items-center gap-6 px-4 w-full max-w-sm"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={spring}
          >
            {/* Card preview */}
            <motion.div
              className="w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10"
              initial={{ y: 16 }}
              animate={{ y: 0 }}
              transition={{ ...spring, delay: 0.05 }}
            >
              <img
                src={state.signedUrl}
                alt="Your Family DNA Map legacy card"
                className="w-full h-auto"
                loading="lazy"
              />
            </motion.div>

            {/* Action buttons */}
            <motion.div
              className="flex gap-3 w-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.15 }}
            >
              {/* Download */}
              <button
                className="btn-gradient flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                {isDownloading ? 'Saving…' : 'Download'}
              </button>

              {/* Share */}
              <button
                className="flex-1 py-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                onClick={handleShare}
                disabled={isSharing}
              >
                {isSharing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : copySuccess ? (
                  <CheckCircle2 size={16} className="text-green-400" />
                ) : (
                  <Share2 size={16} />
                )}
                {isSharing ? 'Sharing…' : copySuccess ? 'Copied!' : 'Share'}
              </button>
            </motion.div>

            {/* Hint text */}
            <motion.p
              className="text-xs text-muted-foreground text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {typeof navigator !== 'undefined' && navigator.share
                ? 'Tap Share to send your card via any app.'
                : 'Download the card and share it anywhere you like.'}
            </motion.p>

            {/* Disclaimer */}
            <motion.p
              className="text-xs text-muted-foreground/60 text-center max-w-xs mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Fun resemblance analysis — not a genetic or paternity test.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
