/**
 * /mystery/:id — Mystery Match mode (Phase 7).
 *
 * Shows each feature's crop images but hides:
 *   - The feature label (which feature it is)
 *   - The winner's name and relationship
 *
 * User guesses which family member the feature belongs to.
 * Spring reveal animation on correct / wrong answer.
 * Final score screen at the end.
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, HelpCircle, CheckCircle2, XCircle, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { createSignedUrlSafe } from '@/lib/storage';
import { captureEvent } from '@/lib/analytics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Person {
  id: string;
  display_name: string;
  relationship_tag: string;
  is_self: boolean;
}

interface QuizItem {
  matchId: string;
  featureType: string;
  selfCropUrl: string | null;
  winnerCropUrl: string | null;
  winnerPersonId: string;
  winnerName: string;
  similarity: number;
}

type GuessState = 'idle' | 'correct' | 'wrong';

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchMysteryData(analysisId: string) {
  const { data: analysis, error: aErr } = await supabase
    .from('analyses')
    .select('id, user_id, self_person_id, status')
    .eq('id', analysisId)
    .single();
  if (aErr || !analysis) throw new Error(aErr?.message ?? 'Analysis not found');
  if (analysis.status !== 'done') throw new Error('Analysis not ready');

  const { data: matches, error: mErr } = await supabase
    .from('feature_matches')
    .select('id, feature_type, winner_person_id, winner_similarity')
    .eq('analysis_id', analysisId)
    .order('winner_similarity', { ascending: false });
  if (mErr) throw new Error(mErr.message);

  const { data: persons, error: pErr } = await supabase
    .from('persons')
    .select('id, display_name, relationship_tag, is_self')
    .eq('owner_user_id', analysis.user_id);
  if (pErr) throw new Error(pErr.message);

  const selfId = analysis.self_person_id;
  const personMap = new Map<string, Person>((persons ?? []).map(p => [p.id, p]));

  // Crop signed URLs
  const allPersonIds = [selfId, ...new Set((matches ?? []).map(m => m.winner_person_id))];
  const { data: cropRows } = await supabase
    .from('feature_embeddings')
    .select('person_id, feature_type, crop_storage_path')
    .in('person_id', allPersonIds)
    .not('crop_storage_path', 'is', null);

  const cropMap = new Map<string, string>();
  await Promise.all(
    (cropRows ?? []).map(async r => {
      const { data } = await createSignedUrlSafe(
        'feature-crops',
        r.crop_storage_path as string,
        900,
      );
      if (data?.signedUrl) cropMap.set(`${r.person_id}::${r.feature_type}`, data.signedUrl);
    }),
  );

  const family = (persons ?? []).filter(p => !p.is_self);

  const quizItems: QuizItem[] = (matches ?? []).map(m => {
    const winner = personMap.get(m.winner_person_id);
    return {
      matchId: m.id,
      featureType: m.feature_type,
      selfCropUrl: cropMap.get(`${selfId}::${m.feature_type}`) ?? null,
      winnerCropUrl: cropMap.get(`${m.winner_person_id}::${m.feature_type}`) ?? null,
      winnerPersonId: m.winner_person_id,
      winnerName: winner?.display_name ?? 'Family member',
      similarity: m.winner_similarity,
    };
  });

  return { quizItems, family, selfId };
}

// ── Quiz card ─────────────────────────────────────────────────────────────────

interface QuizCardProps {
  item: QuizItem;
  family: Person[];
  questionNumber: number;
  total: number;
  onAnswer: (correct: boolean) => void;
}

function QuizCard({ item, family, questionNumber, total, onAnswer }: QuizCardProps) {
  const [guessState, setGuessState] = useState<GuessState>('idle');
  const [guessedId, setGuessedId] = useState<string | null>(null);

  function handleGuess(personId: string) {
    if (guessState !== 'idle') return;
    const correct = personId === item.winnerPersonId;
    setGuessedId(personId);
    setGuessState(correct ? 'correct' : 'wrong');
    setTimeout(() => onAnswer(correct), 1400);
  }

  return (
    <motion.div
      key={item.matchId}
      className="w-full max-w-sm px-4 flex flex-col items-center gap-6"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      {/* Progress */}
      <div className="w-full flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan to-fuchsia-500"
            initial={{ width: `${((questionNumber - 1) / total) * 100}%` }}
            animate={{ width: `${(questionNumber / total) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {questionNumber} / {total}
        </span>
      </div>

      {/* Question label */}
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <HelpCircle size={16} className="text-cyan" />
        Whose feature matches yours?
      </div>

      {/* Crop images */}
      <div className="flex gap-4 justify-center">
        <CropImage url={item.selfCropUrl} label="You" />
        <CropImage url={item.winnerCropUrl} label="???" blur={guessState === 'idle'} />
      </div>

      {/* Similarity hint */}
      <p className="text-xs text-muted-foreground">
        Similarity: <span className="text-cyan font-semibold">{Math.round(item.similarity * 100)}%</span>
      </p>

      {/* Answer options */}
      <div className="w-full grid grid-cols-2 gap-2">
        {family.map(p => {
          const isGuessed = guessedId === p.id;
          const isCorrect = p.id === item.winnerPersonId;
          let colorClass = 'bg-white/8 border-white/10 hover:bg-white/12 active:scale-[0.97]';
          if (guessState !== 'idle') {
            if (isCorrect) colorClass = 'bg-cyan/20 border-cyan/50 text-cyan';
            else if (isGuessed) colorClass = 'bg-red-500/20 border-red-500/40 text-red-400';
            else colorClass = 'bg-white/4 border-white/5 text-white/30';
          }
          return (
            <button
              key={p.id}
              onClick={() => handleGuess(p.id)}
              disabled={guessState !== 'idle'}
              className={`relative flex flex-col items-center gap-1 py-3 px-2 rounded-xl border text-sm font-medium transition-all ${colorClass}`}
            >
              {guessState !== 'idle' && isCorrect && (
                <CheckCircle2 size={14} className="absolute top-1.5 right-1.5 text-cyan" />
              )}
              {guessState !== 'idle' && isGuessed && !isCorrect && (
                <XCircle size={14} className="absolute top-1.5 right-1.5 text-red-400" />
              )}
              <span className="truncate max-w-full">{p.display_name}</span>
              <span className="text-xs text-muted-foreground capitalize">{p.relationship_tag.replace(/_/g, ' ')}</span>
            </button>
          );
        })}
      </div>

      {/* Reveal feedback */}
      <AnimatePresence>
        {guessState !== 'idle' && (
          <motion.div
            className={`text-sm font-medium ${guessState === 'correct' ? 'text-cyan' : 'text-red-400'}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {guessState === 'correct'
              ? '✓ Correct!'
              : `Answer: ${item.winnerName}`}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CropImage({ url, label, blur = false }: { url: string | null; label: string; blur?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-28 h-28 rounded-2xl overflow-hidden bg-white/5 border border-white/10 transition-all duration-500 ${blur ? 'blur-md' : ''}`}>
        {url ? (
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            No image
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Score screen ──────────────────────────────────────────────────────────────

function ScoreScreen({ score, total, analysisId }: { score: number; total: number; analysisId: string }) {
  const navigate = useNavigate();
  const pct = Math.round((score / total) * 100);

  const message =
    pct === 100 ? 'Perfect! You know your family well.' :
    pct >= 60  ? 'Nice! You spotted some family resemblances.' :
                 'Keep looking — family resemblances can be subtle.';

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen gap-8 px-6 text-center"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
    >
      <Trophy size={56} className="text-cyan" />

      <div className="space-y-1">
        <p className="text-4xl font-bold gradient-text">{score} / {total}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>

      {/* Score arc */}
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
          <motion.circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke="url(#scoreGrad)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 52}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - score / total) }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
          <defs>
            <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">
          {pct}%
        </span>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          className="btn-gradient px-6 py-3 text-sm font-medium"
          onClick={() => {
            captureEvent('mystery_match_replayed', { analysis_id: analysisId, score, total });
            window.location.reload();
          }}
        >
          Play again
        </button>
        <button
          className="px-6 py-3 text-sm font-medium rounded-xl bg-white/8 hover:bg-white/12 transition-colors border border-white/10"
          onClick={() => navigate(`/results/${analysisId}`)}
        >
          Back to results
        </button>
      </div>

      <p className="text-xs text-muted-foreground max-w-xs">
        Fun resemblance analysis — not a genetic or paternity test.
      </p>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MysteryMatch() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['mystery', id],
    queryFn: () => fetchMysteryData(id!),
    enabled: !!id,
    staleTime: 60_000,
  });

  // Loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 size={36} className="animate-spin text-cyan" />
        <p className="text-sm text-muted-foreground">Loading mystery…</p>
      </div>
    );
  }

  // Error
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6">
        <AlertCircle size={40} className="text-destructive" />
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          {(error as Error)?.message ?? 'Could not load mystery match.'}
        </p>
        <button
          className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium"
          onClick={() => navigate('/home')}
        >
          Back to home
        </button>
      </div>
    );
  }

  const { quizItems, family } = data;

  // Need at least 2 family members for multiple-choice to be meaningful
  if (family.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6 text-center">
        <HelpCircle size={40} className="text-cyan" />
        <p className="text-sm text-muted-foreground max-w-xs">
          Mystery Match needs at least 2 family members. Add more family members and run a new analysis.
        </p>
        <button
          className="btn-gradient px-6 py-3 text-sm"
          onClick={() => navigate('/family/add')}
        >
          Add family members
        </button>
      </div>
    );
  }

  // Done
  if (done) {
    return <ScoreScreen score={score} total={quizItems.length} analysisId={id!} />;
  }

  const currentItem = quizItems[questionIndex];

  function handleAnswer(correct: boolean) {
    if (correct) setScore(s => s + 1);
    if (questionIndex + 1 >= quizItems.length) {
      captureEvent('mystery_match_completed', {
        analysis_id: id,
        score: correct ? score + 1 : score,
        total: quizItems.length,
      });
      setDone(true);
    } else {
      setQuestionIndex(i => i + 1);
    }
  }

  return (
    <div className="flex flex-col items-center min-h-screen pb-28 pt-10">
      {/* Header */}
      <motion.div
        className="w-full max-w-sm px-4 mb-6 text-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <h1 className="text-2xl font-bold gradient-text">Mystery Match</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Can you guess which family member matches each feature?
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        <QuizCard
          key={currentItem.matchId}
          item={currentItem}
          family={family}
          questionNumber={questionIndex + 1}
          total={quizItems.length}
          onAnswer={handleAnswer}
        />
      </AnimatePresence>
    </div>
  );
}
