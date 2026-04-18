import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, User, Loader2, AlertCircle, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { captureEvent } from "@/lib/analytics";
import { ensureAllCropsUploaded, cropAndUploadFeatures } from "@/lib/face/uploadCrops";
import { normalizeToPortrait } from "@/lib/face/normalize";
import { initDetector, setRunningMode, detectImage } from "@/lib/face/detector";
import PhotoEditSheet from "@/components/PhotoEditSheet";
import FaceCropDialog from "@/components/FaceCropDialog";
import type { Person } from "@/lib/supabase";

const spring = { type: "spring" as const, stiffness: 300, damping: 26 };

// Relationship slots shown on the home screen
const EMPTY_SLOTS = [
  { label: "Add Mom", tag: "mother" },
  { label: "Add Dad", tag: "father" },
  { label: "Add Grandparent", tag: "maternal_grandma" },
  { label: "Add Sibling", tag: "sibling" },
];

// ── Loading skeleton ───────────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div
      className="flex flex-col items-center min-h-screen px-6 pt-12 gap-8 pb-24"
      aria-busy="true"
      aria-label="Loading family tree"
    >
      <Skeleton className="h-7 w-36 rounded-lg" />
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="w-24 h-24 rounded-full" />
        <Skeleton className="h-4 w-20 rounded" />
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {[0, 1, 2, 3].map((i) => (
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
  facePosition,
  onClick,
  onEdit,
}: {
  self: Person | undefined;
  thumbnailUrl: string | null;
  facePosition: string;
  onClick: () => void;
  onEdit: () => void;
}) {
  const captured = !!self;

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        className={`relative w-24 h-32 rounded-full overflow-hidden border-2 transition-colors cursor-pointer ${
          captured ? "border-cyan shadow-[0_0_16px_rgba(0,229,255,0.4)]" : "border-dashed border-white/20 bg-white/5"
        }`}
        style={{ borderRadius: "50% / 50%", aspectRatio: "auto" }} // Explicitly override rounded-full constraint for an oval
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring, delay: 0.1 }}
        onClick={captured ? onEdit : onClick}
        role="button"
        tabIndex={0}
        aria-label={captured ? `${self.display_name} — tap to edit photo` : "Add your photo"}
        onKeyDown={(e) => {
          if (e.key === "Enter") (captured ? onEdit : onClick)();
        }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={self?.display_name ?? "You"}
            className="w-full h-full object-cover"
            style={{ objectPosition: facePosition }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User size={36} className="text-muted-foreground" aria-hidden="true" />
          </div>
        )}

        {/* Captured badge */}
        {captured && (
          <div className="absolute bottom-1 right-2 w-6 h-6 rounded-full bg-cyan flex items-center justify-center border-2 border-background">
            <CheckCircle2 size={12} className="text-background" />
          </div>
        )}
      </motion.div>

      <span className="text-sm font-medium mt-1">
        {captured ? self.display_name : <span className="text-muted-foreground">Add yourself</span>}
      </span>
      {captured && <span className="text-xs text-cyan/70">Captured ✓</span>}
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
    queryKey: ["persons", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("persons")
        .select("*")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const self = persons.find((p) => p.is_self);
  const family = persons.filter((p) => !p.is_self);

  // Stored portrait is already oval-cropped at capture time → just need a signed URL.
  const { data: selfThumbnailUrl = null } = useQuery<string | null>({
    queryKey: ["self-thumbnail", self?.id],
    enabled: !!self?.id,
    staleTime: 300_000,
    queryFn: async () => {
      const { data: images } = await supabase
        .from("face_images")
        .select("storage_path")
        .eq("person_id", self!.id)
        .eq("angle", "front")
        .order("created_at", { ascending: false })
        .limit(1);

      const path = images?.[0]?.storage_path;
      if (!path) return null;

      const { data } = await supabase.storage.from("face-images-raw").createSignedUrl(path, 900);
      return data?.signedUrl ?? null;
    },
  });

  const selfFacePosition = "center";

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [analyzeStatus, setAnalyzeStatus] = useState("");

  // Photo edit sheet state
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null);

  // Face crop dialog state
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState("");
  const [cropPersonId, setCropPersonId] = useState<string | null>(null);

  const canAnalyze = !!self && family.length >= 1;

  // Determine which empty slots still need to be filled
  const filledTags = new Set(family.map((p) => p.relationship_tag));
  const emptySlots = EMPTY_SLOTS.filter((s) => !filledTags.has(s.tag));

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

  const handleCropConfirm = useCallback(
    async (blob: Blob) => {
      if (!user || !cropPersonId) return;

      try {
        // Capture existing front photos so we can replace them after the new upload succeeds.
        const { data: previousFrontImages } = await supabase
          .from("face_images")
          .select("id, storage_path")
          .eq("person_id", cropPersonId)
          .eq("angle", "front");

        const normalizedBlob = await normalizeToPortrait(blob);

        const path = `${user.id}/${cropPersonId}/cropped_${Date.now()}.jpg`;
        const { error: se } = await supabase.storage
          .from("face-images-raw")
          .upload(path, normalizedBlob, { contentType: "image/jpeg" });
        if (se) throw se;

        // Insert new face_images row
        const { data: inserted, error: insertError } = await supabase
          .from("face_images")
          .insert({
            person_id: cropPersonId,
            storage_path: path,
            angle: "front",
            capture_method: "upload_cropped",
            face_confidence: 1,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        // Detect landmarks directly on the final normalized crop blob
        await initDetector();
        await setRunningMode("IMAGE");
        const croppedImgForDetect = new Image();
        croppedImgForDetect.src = URL.createObjectURL(normalizedBlob);
        await new Promise<void>((resolve, reject) => {
          croppedImgForDetect.onload = () => resolve();
          croppedImgForDetect.onerror = () => reject(new Error("Failed to load cropped image for detection"));
        });

        const finalDetectionResult = detectImage(croppedImgForDetect);
        const finalLandmarks = finalDetectionResult.faceLandmarks?.[0] ?? [];
        const finalMatrices = finalDetectionResult.facialTransformationMatrixes?.[0]?.data
          ? Array.from(finalDetectionResult.facialTransformationMatrixes[0].data)
          : null;

        // Store face_landmarks
        await supabase.from("face_landmarks").insert({
          face_image_id: inserted.id,
          landmarks_json: {
            landmarks: finalLandmarks,
            matrix: finalMatrices,
            bbox: { x: 0, y: 0, w: 1, h: 1 },
          },
        });

        // Update face confidence to reflect if we found a face
        if (finalLandmarks.length === 0) {
          await supabase.from("face_images").update({ face_confidence: 0 }).eq("id", inserted.id);
        }

        // Crop features client-side
        if (finalLandmarks.length > 0) {
          try {
            await cropAndUploadFeatures(cropPersonId, inserted.id, croppedImgForDetect, finalDetectionResult, "front");
          } catch (cropErr) {
            console.warn("[Home edit crop] Feature crop upload failed:", cropErr);
          }
        }
        URL.revokeObjectURL(croppedImgForDetect.src);

        // Remove older front images so analysis and UI always use the newest portrait.
        const oldFrontImages = (previousFrontImages ?? []).filter((img) => img.id !== inserted.id);
        if (oldFrontImages.length) {
          const oldIds = oldFrontImages.map((img) => img.id);
          const oldPaths = oldFrontImages.map((img) => img.storage_path).filter(Boolean);

          // Best-effort storage cleanup for raw images.
          if (oldPaths.length) {
            await supabase.storage.from("face-images-raw").remove(oldPaths);
          }

          // Best-effort storage cleanup for per-image feature crops.
          const cropPaths: string[] = [];
          for (const imageId of oldIds) {
            const imagePrefix = `${user.id}/${cropPersonId}/${imageId}`;
            const { data: crops } = await supabase.storage.from("feature-crops").list(imagePrefix);
            if (!crops?.length) continue;
            for (const file of crops) {
              cropPaths.push(`${imagePrefix}/${file.name}`);
            }
          }
          if (cropPaths.length) {
            await supabase.storage.from("feature-crops").remove(cropPaths);
          }

          // DB delete cascades landmarks/embeddings tied to old front images.
          await supabase.from("face_images").delete().in("id", oldIds);
        }

        // Invalidate thumbnail caches so they refresh
        await queryClient.invalidateQueries({ queryKey: ["self-thumbnail"] });
        await queryClient.invalidateQueries({ queryKey: ["family-thumbnail"] });
        await queryClient.invalidateQueries({ queryKey: ["persons", user.id] });
      } catch (err) {
        console.error("Crop save failed", err);
      }
    },
    [user, cropPersonId, queryClient],
  );

  // ── Handle family member re-upload ────────────────────────────────────────

  const handleFamilyReupload = useCallback(
    (file: File) => {
      if (!editPerson) return;
      // Navigate to family add page with person_id for replacement
      navigate(`/family/add?tag=${editPerson.relationship_tag}`);
    },
    [editPerson, navigate],
  );

  // ── Handle delete member ─────────────────────────────────────────────────

  const handleDeleteMember = useCallback(async () => {
    if (!editPerson || !user) return;

    try {
      // 1. Fetch all storage paths for this person's images
      const { data: images } = await supabase
        .from("face_images")
        .select("id, storage_path")
        .eq("person_id", editPerson.id);

      // 2. Delete storage files (best-effort — DB cascade is the source of truth)
      if (images?.length) {
        const paths = images.map((i) => i.storage_path).filter(Boolean);
        if (paths.length) {
          await supabase.storage.from("face-images-raw").remove(paths);
        }
      }

      // 3. Also remove any feature crops from storage (best-effort).
      // Crops are stored under: {userId}/{personId}/{faceImageId}/{featureType}.png
      if (images?.length) {
        const cropPaths: string[] = [];
        for (const image of images) {
          const imagePrefix = `${user.id}/${editPerson.id}/${image.id}`;
          const { data: crops } = await supabase.storage.from("feature-crops").list(imagePrefix);
          if (!crops?.length) continue;
          for (const file of crops) {
            cropPaths.push(`${imagePrefix}/${file.name}`);
          }
        }

        if (cropPaths.length) {
          await supabase.storage.from("feature-crops").remove(cropPaths);
        }
      }

      // 4. Remove historical feature_matches that reference this person as winner.
      // Without this, FK constraints can block deleting the person row.
      const { error: matchDeleteError } = await supabase
        .from("feature_matches")
        .delete()
        .eq("winner_person_id", editPerson.id);
      if (matchDeleteError) throw matchDeleteError;

      // 5. Delete the person row — cascades to face_images, landmarks, embeddings, etc.
      const { error } = await supabase.from("persons").delete().eq("id", editPerson.id);
      if (error) throw error;

      // 6. Optimistically update local list so the card disappears immediately.
      queryClient.setQueryData<Person[]>(["persons", user.id], (existing = []) =>
        existing.filter((p) => p.id !== editPerson.id),
      );

      // 7. Refresh related queries
      await queryClient.invalidateQueries({ queryKey: ["persons", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["family-thumbnail"] });
      await queryClient.invalidateQueries({ queryKey: ["self-thumbnail"] });

      setEditPerson(null);
      setEditSheetOpen(false);
    } catch (err) {
      console.error("Delete member failed", err);
    }
  }, [editPerson, user, queryClient]);

  // ── Start analysis ────────────────────────────────────────────────────────

  const startAnalysis = async () => {
    if (!self || !user) return;
    setAnalyzing(true);
    setAnalyzeError("");
    setAnalyzeStatus("Preparing feature crops…");
    captureEvent("analysis_started", { self_person_id: self.id });
    try {
      // Ensure all face images have feature crops + CLIP embeddings.
      // This backfills any images missing crops/embeddings by:
      // 1. Generating crops client-side from stored landmarks
      // 2. Uploading to feature-crops bucket
      // 3. Running CLIP ViT-B/32 in-browser via Transformers.js (no API calls)
      // 4. Inserting embeddings directly into feature_embeddings table
      await ensureAllCropsUploaded((done, total) => {
        setAnalyzeStatus(`Preparing features… ${done}/${total}`);
      });

      setAnalyzeStatus("Starting analysis…");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ self_person_id: self.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Analysis failed to start");
      navigate(`/analysis/${json.analysis_id}`);
    } catch (err) {
      setAnalyzeError((err as Error).message);
      setAnalyzing(false);
      setAnalyzeStatus("");
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return <HomeSkeleton />;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6" role="alert">
        <AlertCircle size={36} className="text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground text-center">Could not load your family tree. Please try again.</p>
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

  // ── Determine Tree Tiers ──────────────────────────────────────────────────
  const RELATIONSHIP_GENERATIONS: Record<string, number> = {
    mother: 1,
    father: 1,
    maternal_grandma: 2,
    maternal_grandpa: 2,
    paternal_grandma: 2,
    paternal_grandpa: 2,
    sibling: 0,
    uncle: 1,
    aunt: 1,
    child: -1,
    other: 0,
  };

  const getGen = (tag: string) => RELATIONSHIP_GENERATIONS[tag] ?? 0;

  const grandParents = family.filter((f) => getGen(f.relationship_tag) === 2);
  const parents = family.filter((f) => getGen(f.relationship_tag) === 1);
  const peers = family.filter((f) => getGen(f.relationship_tag) === 0);
  const children = family.filter((f) => getGen(f.relationship_tag) === -1);

  const emptySlotsByGen = {
    2: emptySlots.filter((s) => getGen(s.tag) === 2),
    1: emptySlots.filter((s) => getGen(s.tag) === 1),
    0: emptySlots.filter((s) => getGen(s.tag) === 0),
    "-1": emptySlots.filter((s) => getGen(s.tag) === -1),
  };

  const getMemberHandler = (person: Person) => {
    return async () => {
      const { data: images } = await supabase
        .from("face_images")
        .select("storage_path")
        .eq("person_id", person.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const path = images?.[0]?.storage_path;
      let url: string | null = null;
      if (path) {
        const { data } = await supabase.storage.from("face-images-raw").createSignedUrl(path, 900);
        url = data?.signedUrl ?? null;
      }
      openEditSheet(person, url);
    };
  };

  const renderMember = (person: Person, delayIndex: number) => (
    <motion.div
      key={person.id}
      className="glass-card p-4 flex flex-col items-center gap-3 cursor-pointer hover:bg-white/10 transition-colors w-28 sm:w-32 z-10"
      role="listitem"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.15 + delayIndex * 0.05 }}
      onClick={getMemberHandler(person)}
      tabIndex={0}
      aria-label={`${person.display_name} — tap to edit photo`}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.click();
      }}
    >
      <FamilyMemberAvatar person={person} />
      <div className="text-center w-full">
        <div className="text-sm font-semibold truncate w-full">{person.display_name}</div>
        <div className="text-[10px] text-cyan/80 uppercase tracking-widest truncate w-full mt-0.5">
          {person.relationship_tag.replace(/_/g, " ")}
        </div>
      </div>
    </motion.div>
  );

  const renderEmptySlot = (slot: (typeof EMPTY_SLOTS)[0], delayIndex: number) => (
    <motion.button
      key={slot.tag}
      className="glass-card border-dashed border-white/20 p-4 flex flex-col items-center justify-start gap-4 cursor-pointer hover:bg-white/10 transition-colors w-28 sm:w-32 focus-visible:ring-2 focus-visible:ring-cyan focus-visible:outline-none z-10"
      onClick={() => navigate(`/family/add?tag=${slot.tag}`)}
      aria-label={slot.label}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.2 + delayIndex * 0.05 }}
    >
      <div
        className="w-16 h-20 rounded-full border-2 border-dashed border-white/20 flex flex-col items-center justify-center bg-white/5 transition-colors"
        style={{ borderRadius: "50% / 50%" }}
      >
        <Plus size={24} className="text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground font-medium leading-tight">{slot.label}</div>
      </div>
    </motion.button>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col items-center min-h-screen px-4 sm:px-8 pt-12 gap-10 pb-32 max-w-5xl mx-auto w-full relative">
      <motion.h1
        className="text-3xl font-bold tracking-tight"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={spring}
      >
        Family Tree
      </motion.h1>

      <div className="flex flex-col items-center gap-14 w-full relative mt-4">
        {/* Decorative Spine Line */}
        <div className="absolute top-8 bottom-0 left-1/2 w-px bg-gradient-to-b from-cyan/50 via-white/10 to-transparent -translate-x-1/2 -z-0 hidden md:block" />

        {/* Tier 2: Grandparents */}
        {(grandParents.length > 0 || emptySlotsByGen[2].length > 0) && (
          <div className="flex flex-col items-center gap-5 w-full">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground/60 font-semibold bg-background px-4 relative z-10">
              Grandparents
            </h3>
            <div className="flex flex-wrap justify-center gap-4 sm:gap-8 w-full">
              {grandParents.map((p, i) => renderMember(p, i))}
              {emptySlotsByGen[2].map((s, i) => renderEmptySlot(s, grandParents.length + i))}
            </div>
          </div>
        )}

        {/* Tier 1: Parents */}
        {(parents.length > 0 || emptySlotsByGen[1].length > 0) && (
          <div className="flex flex-col items-center gap-5 w-full">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground/60 font-semibold bg-background px-4 relative z-10">
              Parents
            </h3>
            <div className="flex flex-wrap justify-center gap-4 sm:gap-8 w-full">
              {parents.map((p, i) => renderMember(p, i))}
              {emptySlotsByGen[1].map((s, i) => renderEmptySlot(s, parents.length + i))}
            </div>
          </div>
        )}

        {/* Tier 0: You & Siblings */}
        <div className="flex flex-col items-center gap-5 w-full">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground/60 font-semibold bg-background px-4 relative z-10">
            You & Siblings
          </h3>
          <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-8 w-full relative z-10">
            {peers.map((p, i) => renderMember(p, i))}

            {/* Self Avatar */}
            <div className="mx-2 sm:mx-6 flex-shrink-0 z-10">
              <SelfAvatar
                self={self}
                thumbnailUrl={selfThumbnailUrl}
                facePosition={selfFacePosition}
                onClick={() => navigate("/capture")}
                onEdit={() => self && openEditSheet(self, selfThumbnailUrl)}
              />
            </div>

            {emptySlotsByGen[0].map((s, i) => renderEmptySlot(s, peers.length + i))}
          </div>
        </div>

        {/* Tier -1: Children */}
        {(children.length > 0 || emptySlotsByGen["-1"].length > 0) && (
          <div className="flex flex-col items-center gap-5 w-full">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground/60 font-semibold bg-background px-4 relative z-10">
              Children
            </h3>
            <div className="flex flex-wrap justify-center gap-4 sm:gap-8 w-full">
              {children.map((p, i) => renderMember(p, i))}
              {emptySlotsByGen["-1"].map((s, i) => renderEmptySlot(s, children.length + i))}
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3 mt-8 relative z-10 bg-background/80 p-4 rounded-3xl backdrop-blur-sm border border-white/5">
        <motion.button
          className="btn-gradient px-8 py-3.5 text-base font-medium disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-cyan/20"
          onClick={canAnalyze ? startAnalysis : () => navigate("/capture")}
          disabled={analyzing}
          aria-busy={analyzing}
          aria-label={canAnalyze ? "Start Family DNA analysis" : "Add yourself and a family member to start"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...spring, delay: 0.4 }}
          whileHover={!analyzing ? { scale: 1.04 } : {}}
          whileTap={!analyzing ? { scale: 0.97 } : {}}
        >
          {analyzing && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {canAnalyze ? "Discover your Family DNA" : "Add yourself + 1 family member to start"}
        </motion.button>

        {analyzing && analyzeStatus && (
          <p className="text-sm font-medium text-cyan animate-pulse mt-2">{analyzeStatus}</p>
        )}

        {analyzeError && (
          <div className="flex flex-col items-center gap-1.5 max-w-sm px-4 text-center mt-2" role="alert">
            {rateLimitInfo?.isRateLimit ? (
              <>
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Clock size={16} />
                  <p className="text-sm font-semibold">Daily limit reached</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  You've used all your analyses for today. Try again in ~{rateLimitInfo.hoursLeft}h.
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-destructive">{analyzeError}</p>
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
          onDelete={handleDeleteMember}
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
    queryKey: ["family-thumbnail", person.id],
    staleTime: 300_000,
    queryFn: async () => {
      const { data: images } = await supabase
        .from("face_images")
        .select("storage_path")
        .eq("person_id", person.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const path = images?.[0]?.storage_path;
      if (!path) return null;

      const { data } = await supabase.storage.from("face-images-raw").createSignedUrl(path, 900);
      return data?.signedUrl ?? null;
    },
  });

  return (
    <div
      className="w-16 h-20 rounded-full overflow-hidden border border-white/15 bg-white/10 flex items-center justify-center"
      style={{ borderRadius: "50% / 50%" }}
    >
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt={person.display_name} className="w-full h-full object-cover object-center" />
      ) : (
        <User size={22} className="text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}

export default Home;
