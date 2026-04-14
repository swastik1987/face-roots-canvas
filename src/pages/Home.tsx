import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, User, Loader2, AlertCircle, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { captureEvent } from '@/lib/analytics';
import PhotoEditSheet from '@/components/PhotoEditSheet';
import FaceCropDialog from '@/components/FaceCropDialog';
import type { Person } from '@/lib/supabase';

const spring = { type: 'spring' as const, stiffness: 300, damping: 26 };

// Relationship slots shown on the home screen
const EMPTY_SLOTS = [
  { label: 'Add Mom',         tag: 'mother'          },
  { label: 'Add Dad',         tag: 'father'          },
  { label: 'Add Grandparent', tag: 'maternal_grandma'},
  { label: 'Add Sibling',     tag: 'sibling'         },
];

// ── Loading skeleton ───────────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div className="flex flex-col items-center min-h-screen px-6 pt-12 gap-8 pb-24" aria-busy="true" aria-label="Loading family tree">
      <Skeleton className="h-7 w-36 rounded-lg" />
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="w-24 h-24 rounded-full" />
        <Skeleton className="h-4 w-20 rounded" />
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-12 w-52 rounded-full mt-4" />
    </div>
  );
}

// ── Self avatar ────────────────────────────────────────────────────────────────

function SelfAvatar({
  self,
  thumbnailUrl,
  onClick,
  onEdit,
}: {
  self: Person | undefined;
  thumbnailUrl: string | null;
  onClick: () => void;
  onEdit: () => void;
}) {
  const captured = !!self;

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        className={`relative w-24 h-24 rounded-full overflow-hidden border-2 transition-colors cursor-pointer ${
          captured
            ? 'border-cyan shadow-[0_0_16px_rgba(0,229,255,0.4)]'
            : 'border-dashed border-white/20 bg-white/5'
        }`}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring, delay: 0.1 }}
        onClick={captured ? onEdit : onClick}
        role="button"
        tabIndex={0}
        aria-label={captured ? `${self.display_name} — tap to edit photo` : 'Add your photo'}
        onKeyDown={e => { if (e.key === 'Enter') (captured ? onEdit : onClick)(); }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={self?.display_name ?? 'You'}
            className="w-full h-full object-cover"
            style={{ objectPosition: 'center 25%' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User size={36} className="text-muted-foreground" aria-hidden="true" />
          </div>
        )}

        {/* Captured badge */}
        {captured && (
          <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-cyan flex items-center justify-center border-2 border-background">
            <CheckCircle2 size={12} className="text-background" />
          </div>
        )}
      </motion.div>

      <span className="text-sm font-medium">
        {captured ? self.display_name : (
          <span className="text-muted-foreground">Add yourself</span>
        )}
      </span>
      {captured && (
        <span className="text-xs text-cyan/70">Captured ✓</span>
      )}
    </div>
  );
}

// ── Rate limit error parser ──────────────────────────────────────────────────

function parseRateLimitError(msg: string): { isRateLimit: boolean; hoursLeft?: number } {
  const match = msg.match(/Rate limit exceeded for action ".*"\. Max (\d+) per (\d+)s/);
  if (!match) return { isRateLimit: false };
  const windowSecs = parseInt(match[2], 10);
  // Approximate: assume the window started now, so resets in ~windowSecs
  const hoursLeft = Math.ceil(windowSecs / 3600);
  return { isRateLimit: true, hoursLeft };
}

// ── Main component ─────────────────────────────────────────────────────────────

const Home = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const {
    data: persons = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Person[]>({
    queryKey: ['persons', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('persons')
        .select('*')
        .eq('owner_user_id', user!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const self   = persons.find(p => p.is_self);
  const family = persons.filter(p => !p.is_self);

  // Fetch the self person's front-angle thumbnail (only when self exists)
  const { data: selfThumbnailUrl = null } = useQuery<string | null>({
    queryKey: ['self-thumbnail', self?.id],
    enabled: !!self?.id,
    staleTime: 300_000, // 5 min — signed URL is good for 15 min
    queryFn: async () => {
      const { data: images } = await supabase
        .from('face_images')
        .select('storage_path')
        .eq('person_id', self!.id)
        .eq('angle', 'front')
        .order('created_at', { ascending: false })
        .limit(1);

      const path = images?.[0]?.storage_path;
      if (!path) return null;

      const { data } = await supabase.storage
        .from('face-images-raw')
        .createSignedUrl(path, 900); // 15 min
      return data?.signedUrl ?? null;
    },
  });

  const [analyzing, setAnalyzing]       = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');

  // Photo edit sheet state
  const [editSheetOpen, setEditSheetOpen]   = useState(false);
  const [editPerson, setEditPerson]         = useState<Person | null>(null);
  const [editPhotoUrl, setEditPhotoUrl]     = useState<string | null>(null);

  // Face crop dialog state
  const [cropOpen, setCropOpen]             = useState(false);
  const [cropImageUrl, setCropImageUrl]     = useState('');
  const [cropPersonId, setCropPersonId]     = useState<string | null>(null);

  const canAnalyze = !!self && family.length >= 1;

  // Determine which empty slots still need to be filled
  const filledTags = new Set(family.map(p => p.relationship_tag));
  const emptySlots = EMPTY_SLOTS.filter(s => !filledTags.has(s.tag));

  // ── Open edit sheet for a person ──────────────────────────────────────────

  const openEditSheet = useCallback((person: Person, photoUrl: string | null) => {
    setEditPerson(person);
    setEditPhotoUrl(photoUrl);
    setEditSheetOpen(true);
  }, []);

  // ── Handle edit crop ──────────────────────────────────────────────────────

  const handleEditCrop = useCallback(() => {
    if (!editPhotoUrl || !editPerson) return;
    setCropImageUrl(editPhotoUrl);
    setCropPersonId(editPerson.id);
    setCropOpen(true);
  }, [editPhotoUrl, editPerson]);

  // ── Handle crop confirm — re-upload cropped image ─────────────────────────

  const handleCropConfirm = useCallback(async (blob: Blob) => {
    if (!user || !cropPersonId) return;

    try {
      const path = `${user.id}/${cropPersonId}/cropped_${Date.now()}.jpg`;
      const { error: se } = await supabase.storage
        .from('face-images-raw')
        .upload(path, blob, { contentType: 'image/jpeg' });
      if (se) throw se;

      // Insert new face_images row
      await supabase
        .from('face_images')
        .insert({
          person_id:      cropPersonId,
          storage_path:   path,
          angle:          'front',
          capture_method: 'upload_cropped',
          face_confidence: 1,
        });

      // Invalidate thumbnail caches so they refresh
      await queryClient.invalidateQueries({ queryKey: ['self-thumbnail'] });
      await queryClient.invalidateQueries({ queryKey: ['family-thumbnail'] });
    } catch (err) {
      console.error('Crop save failed', err);
    }
  }, [user, cropPersonId, queryClient]);

  // ── Handle family member re-upload ────────────────────────────────────────

  const handleFamilyReupload = useCallback((file: File) => {
    if (!editPerson) return;
    // Navigate to family add page with person_id for replacement
    navigate(`/family/add?tag=${editPerson.relationship_tag}`);
  }, [editPerson, navigate]);

  // ── Start analysis ────────────────────────────────────────────────────────

  const startAnalysis = async () => {
    if (!self || !user) return;
    setAnalyzing(true);
    setAnalyzeError('');
    captureEvent('analysis_started', { self_person_id: self.id });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-analysis`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ self_person_id: self.id }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Analysis failed to start');
      navigate(`/analysis/${json.analysis_id}`);
    } catch (err) {
      setAnalyzeError((err as Error).message);
      setAnalyzing(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return <HomeSkeleton />;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6" role="alert">
        <AlertCircle size={36} className="text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground text-center">
          Could not load your family tree. Please try again.
        </p>
        <button
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition-colors text-sm font-medium"
          onClick={() => refetch()}
          aria-label="Retry loading family tree"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  // Parse rate limit error for friendly display
  const rateLimitInfo = analyzeError ? parseRateLimitError(analyzeError) : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col items-center min-h-screen px-6 pt-12 gap-8 pb-24">
      <motion.h1
        className="text-2xl font-bold"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={spring}
      >
        Your family
      </motion.h1>

      {/* Self avatar */}
      <SelfAvatar
        self={self}
        thumbnailUrl={selfThumbnailUrl}
        onClick={() => navigate('/capture')}
        onEdit={() => self && openEditSheet(self, selfThumbnailUrl)}
      />

      {/* Family members already added */}
      {family.length > 0 && (
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm" role="list" aria-label="Family members">
          {family.map((person, i) => (
            <motion.div
              key={person.id}
              className="glass-card p-5 flex flex-col items-center gap-2 cursor-pointer hover:bg-white/5 transition-colors"
              role="listitem"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.15 + i * 0.05 }}
              onClick={() => {
                // We need the thumbnail URL — FamilyMemberAvatar fetches it internally,
                // so we fetch it here too for the sheet
                const fetchAndOpen = async () => {
                  const { data: images } = await supabase
                    .from('face_images')
                    .select('storage_path')
                    .eq('person_id', person.id)
                    .order('created_at', { ascending: false })
                    .limit(1);
                  const path = images?.[0]?.storage_path;
                  let url: string | null = null;
                  if (path) {
                    const { data } = await supabase.storage
                      .from('face-images-raw')
                      .createSignedUrl(path, 900);
                    url = data?.signedUrl ?? null;
                  }
                  openEditSheet(person, url);
                };
                fetchAndOpen();
              }}
              tabIndex={0}
              aria-label={`${person.display_name} — tap to edit photo`}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.click(); }}
            >
              <FamilyMemberAvatar person={person} />
              <span className="text-xs font-medium text-center leading-tight">{person.display_name}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {person.relationship_tag.replace(/_/g, ' ')}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty slots */}
      {emptySlots.length > 0 && (
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {emptySlots.map((slot, i) => (
            <motion.button
              key={slot.tag}
              className="glass-card p-6 flex flex-col items-center gap-2 hover:bg-white/10 transition-colors focus-visible:ring-2 focus-visible:ring-cyan focus-visible:outline-none"
              onClick={() => navigate(`/family/add?tag=${slot.tag}`)}
              aria-label={slot.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.2 + i * 0.05 }}
            >
              <Plus size={24} className="text-cyan" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">{slot.label}</span>
            </motion.button>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="flex flex-col items-center gap-2">
        <motion.button
          className="btn-gradient px-8 py-3 text-base mt-4 disabled:opacity-40 flex items-center gap-2"
          onClick={canAnalyze ? startAnalysis : () => navigate('/capture')}
          disabled={analyzing}
          aria-busy={analyzing}
          aria-label={canAnalyze ? 'Start Family DNA analysis' : 'Add yourself and a family member to start'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...spring, delay: 0.4 }}
          whileHover={!analyzing ? { scale: 1.04 } : {}}
          whileTap={!analyzing ? { scale: 0.97 } : {}}
        >
          {analyzing && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {canAnalyze ? 'Discover your Family DNA' : 'Add yourself + 1 family member to start'}
        </motion.button>

        {analyzeError && (
          <div className="flex flex-col items-center gap-1.5 max-w-xs" role="alert">
            {rateLimitInfo?.isRateLimit ? (
              <>
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Clock size={14} />
                  <p className="text-sm font-medium">Daily limit reached</p>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  You've used all your analyses for today. Try again in ~{rateLimitInfo.hoursLeft}h.
                </p>
              </>
            ) : (
              <p className="text-xs text-destructive text-center">{analyzeError}</p>
            )}
          </div>
        )}
      </div>

      {/* Photo edit sheet */}
      {editPerson && (
        <PhotoEditSheet
          open={editSheetOpen}
          onOpenChange={setEditSheetOpen}
          person={editPerson}
          photoUrl={editPhotoUrl}
          onEditCrop={handleEditCrop}
          onReupload={handleFamilyReupload}
        />
      )}

      {/* Face crop dialog */}
      <FaceCropDialog
        open={cropOpen}
        onOpenChange={setCropOpen}
        imageUrl={cropImageUrl}
        onCropConfirm={handleCropConfirm}
      />
    </main>
  );
};

// ── Family member avatar with thumbnail ───────────────────────────────────────

function FamilyMemberAvatar({ person }: { person: Person }) {
  const { data: thumbnailUrl } = useQuery<string | null>({
    queryKey: ['family-thumbnail', person.id],
    staleTime: 300_000,
    queryFn: async () => {
      const { data: images } = await supabase
        .from('face_images')
        .select('storage_path')
        .eq('person_id', person.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const path = images?.[0]?.storage_path;
      if (!path) return null;

      const { data } = await supabase.storage
        .from('face-images-raw')
        .createSignedUrl(path, 900);
      return data?.signedUrl ?? null;
    },
  });

  return (
    <div className="w-14 h-14 rounded-full overflow-hidden border border-white/15 bg-white/10 flex items-center justify-center">
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={person.display_name}
          className="w-full h-full object-cover"
          style={{ objectPosition: 'center 25%' }}
        />
      ) : (
        <User size={22} className="text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}

export default Home;
