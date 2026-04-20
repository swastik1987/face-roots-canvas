/**
 * /results/:id — DNA Map hero screen (Phase 4).
 *
 * Layout:
 *   ┌─────────────────────────────┐
 *   │  "Your Family DNA Map"      │
 *   │  SVG face + hotspot pins    │
 *   │  ─────────────────────────  │
 *   │  FeatureCard × N (list)     │
 *   │  Share CTA                  │
 *   │  Disclaimer footer          │
 *   └─────────────────────────────┘
 *
 * Data flow:
 *   1. Fetch analyses + feature_matches + persons
 *   2. For each match, create signed URLs for self crop + winner crop
 *   3. Render FaceSilhouette with pins; clicking a pin scrolls & highlights
 *      the corresponding FeatureCard
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Share2, HelpCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { createSignedUrlSafe } from '@/lib/storage';
import FaceSilhouette, { type FeatureType } from '@/components/results/FaceSilhouette';
import { FeatureCard, type FeatureCardData } from '@/components/results/FeatureCard';
import StaleAnalysisBanner from '@/components/results/StaleAnalysisBanner';
import Shimmer from '@/components/ui/Shimmer';
import ErrorState from '@/components/ui/ErrorState';
import EmptyIllustration from '@/components/ui/EmptyIllustration';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeatureMatch {
  id: string;
  feature_type: string;
  winner_person_id: string;
  winner_similarity: number;
  winner_confidence: number | null;
  llm_verdict: string | null;
}

interface Person {
  id: string;
  display_name: string;
  relationship_tag: string;
  is_self: boolean;
}

interface FeatureEmbedding {
  person_id: string;
  feature_type: string;
  crop_storage_path: string | null;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchResultsData(analysisId: string) {
  // 1. Analysis row
  const { data: analysis, error: aErr } = await supabase
    .from('analyses')
    .select('id, user_id, self_person_id, status, model_versions, is_stale')
    .eq('id', analysisId)
    .single();
  if (aErr || !analysis) throw new Error(aErr?.message ?? 'Analysis not found');
  if (analysis.status !== 'done') throw new Error(`Analysis not ready (status: ${analysis.status})`);

  // 2. Feature matches
  const { data: matches, error: mErr } = await supabase
    .from('feature_matches')
    .select('id, feature_type, winner_person_id, winner_similarity, winner_confidence, llm_verdict')
    .eq('analysis_id', analysisId)
    .order('winner_similarity', { ascending: false });
  if (mErr) throw new Error(mErr.message);

  // 3. Persons (self + family)
  const { data: persons, error: pErr } = await supabase
    .from('persons')
    .select('id, display_name, relationship_tag, is_self')
    .eq('owner_user_id', analysis.user_id);
  if (pErr) throw new Error(pErr.message);

  const selfPerson = (persons ?? []).find(p => p.is_self);
  const personMap = new Map<string, Person>(
    (persons ?? []).map(p => [p.id, p]),
  );

  // 4. Crop paths for self + all winner persons
  const allPersonIds = [
    analysis.self_person_id,
    ...new Set((matches ?? []).map(m => m.winner_person_id).filter(Boolean)),
  ];

  const { data: cropRows } = await supabase
    .from('feature_embeddings')
    .select('person_id, feature_type, crop_storage_path')
    .in('person_id', allPersonIds)
    .not('crop_storage_path', 'is', null);

  // 5. Batch-create signed URLs (feature-crops bucket)
  const cropMap = new Map<string, string>(); // "personId::featureType" → signedUrl
  const paths = (cropRows ?? []).filter(r => r.crop_storage_path).map(r => ({
    key: `${r.person_id}::${r.feature_type}`,
    path: r.crop_storage_path as string,
  }));

  // Create signed URLs in parallel batches of 20
  const BATCH = 20;
  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(({ key, path }) =>
        createSignedUrlSafe('feature-crops', path, 900)
          .then(({ data }) => ({ key, url: data?.signedUrl ?? null })),
      ),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.url) {
        cropMap.set(r.value.key, r.value.url);
      }
    }
  }

  // 6. Self face image (front angle preferred) for silhouette background
  let selfFaceUrl: string | null = null;
  if (analysis.self_person_id) {
    const { data: selfImage } = await supabase
      .from('face_images')
      .select('storage_path')
      .eq('person_id', analysis.self_person_id)
      .eq('angle', 'front')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fall back to any angle if no front exists
    const imgRow = selfImage ?? (await supabase
      .from('face_images')
      .select('storage_path')
      .eq('person_id', analysis.self_person_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()).data;

    if (imgRow?.storage_path) {
      const { data: signedData } = await createSignedUrlSafe(
        'face-images-raw',
        imgRow.storage_path,
        900,
      );
      selfFaceUrl = signedData?.signedUrl ?? null;
    }
  }

  return { analysis, matches: matches ?? [], personMap, selfPerson, cropMap, selfFaceUrl };
}

// ── Component ─────────────────────────────────────────────────────────────────

const spring = { type: 'spring' as const, stiffness: 260, damping: 22 };

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeFeature, setActiveFeature] = useState<FeatureType | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { data, isLoading, error } = useQuery({
    queryKey: ['results', id],
    queryFn: () => fetchResultsData(id!),
    enabled: !!id,
    staleTime: 60_000,
    retry: 2,
  });

  // Scroll to card when hotspot clicked
  useEffect(() => {
    if (!activeFeature) return;
    const el = cardRefs.current.get(activeFeature);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeFeature]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center min-h-screen pb-28 pt-10 px-6 gap-6 w-full max-w-sm mx-auto" aria-busy="true">
        <Shimmer className="h-6 w-48" />
        <Shimmer className="h-3 w-32" />
        <Shimmer className="w-[220px] h-[308px] rounded-[40%]" rounded="" />
        <div className="w-full space-y-3 mt-4">
          <Shimmer className="h-24 w-full" />
          <Shimmer className="h-24 w-full" />
          <Shimmer className="h-24 w-full" />
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6">
        <ErrorState
          title="Couldn't load results"
          body={(error as Error)?.message ?? 'Please try again in a moment.'}
          action={{ label: 'Back to home', onClick: () => navigate('/home') }}
        />
      </div>
    );
  }

  const { matches, personMap, selfPerson, cropMap, selfFaceUrl } = data;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!matches.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-5 px-6 text-center">
        <EmptyIllustration variant="matches" className="w-48 h-36" />
        <div className="space-y-1">
          <p className="text-lg font-semibold">No matches yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Make sure you and at least one family member have completed feature capture.
          </p>
        </div>
        <button
          className="btn-gradient focus-ring px-6 py-2.5 text-sm mt-2"
          onClick={() => navigate('/home')}
        >
          Go back home
        </button>
      </div>
    );
  }

  // ── Build card data ────────────────────────────────────────────────────────
  const selfId = data.analysis.self_person_id;
  const cards: FeatureCardData[] = matches.map(m => {
    const winner = personMap.get(m.winner_person_id);
    return {
      featureType: m.feature_type,
      winnerName: winner?.display_name ?? 'Family member',
      winnerRelationship: winner?.relationship_tag ?? 'family',
      similarity: m.winner_similarity,
      confidence: m.winner_confidence,
      verdict: m.llm_verdict,
      selfCropUrl: cropMap.get(`${selfId}::${m.feature_type}`) ?? null,
      winnerCropUrl: cropMap.get(`${m.winner_person_id}::${m.feature_type}`) ?? null,
    };
  });

  // Pins for the silhouette (only features that have a match)
  const pins = matches.map(m => ({
    featureType: m.feature_type as FeatureType,
    similarity: m.winner_similarity,
    verdict: m.llm_verdict,
  }));

  return (
    <div className="flex flex-col items-center min-h-screen pb-28">
      {data.analysis.is_stale && <StaleAnalysisBanner />}
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div className="w-full radial-glow pt-10 pb-6 px-6 flex flex-col items-center gap-2">
        <motion.h1
          className="text-2xl font-bold gradient-text text-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
        >
          Your Family DNA Map
        </motion.h1>
        {selfPerson && (
          <motion.p
            className="text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...spring, delay: 0.1 }}
          >
            {selfPerson.display_name} · {matches.length} features matched
          </motion.p>
        )}

        {/* SVG face silhouette */}
        <motion.div
          className="w-full max-w-[240px] mt-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: 0.15 }}
        >
          <FaceSilhouette
            pins={pins}
            activeFeature={activeFeature}
            onFeatureClick={(f) => setActiveFeature(prev => prev === f ? null : f)}
            selfFaceUrl={selfFaceUrl}
          />
        </motion.div>

        <motion.p
          className="text-xs text-muted-foreground mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Tap a pin to explore
        </motion.p>
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm h-px bg-white/8 my-2" />

      {/* ── Feature cards ───────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm px-4 space-y-3 mt-2">
        {cards.map((card, i) => (
          <div
            key={card.featureType}
            ref={(el) => {
              if (el) cardRefs.current.set(card.featureType, el);
            }}
          >
            <FeatureCard
              {...card}
              index={i}
              isActive={activeFeature === card.featureType}
            />
          </div>
        ))}
      </div>

      {/* ── CTAs ────────────────────────────────────────────────────────────── */}
      <motion.div
        className="mt-8 flex flex-col items-center gap-3 px-6 w-full max-w-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        <button
          className="btn-gradient focus-ring px-8 py-3 text-base flex items-center gap-2 w-full justify-center"
          onClick={() => navigate(`/results/${id}/share`)}
        >
          <Share2 size={18} />
          Share your DNA map
        </button>
        <button
          className="focus-ring flex items-center gap-2 px-8 py-3 text-sm font-medium rounded-xl bg-white/8 hover:bg-white/12 active:scale-[0.97] transition-all border border-white/10 w-full justify-center"
          onClick={() => navigate(`/mystery/${id}`)}
        >
          <HelpCircle size={16} className="text-cyan" />
          Try Mystery Match
        </button>
      </motion.div>

      {/* ── Disclaimer ──────────────────────────────────────────────────────── */}
      <motion.p
        className="text-xs text-muted-foreground text-center max-w-xs mt-6 px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        Fun resemblance analysis — not a genetic or paternity test.
      </motion.p>
    </div>
  );
}
