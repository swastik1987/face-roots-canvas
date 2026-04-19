import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, User, Loader2, AlertCircle, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { createSignedUrlSafe } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { captureEvent } from "@/lib/analytics";
import { ensureAllCropsUploaded, cropAndUploadFeatures } from "@/lib/face/uploadCrops";
import { replacePersonFaceImages } from "@/lib/face/replaceFaceImage";
import { normalizeToPortrait } from "@/lib/face/normalize";
import { initDetector, setRunningMode, detectImage } from "@/lib/face/detector";
import PhotoEditSheet from "@/components/PhotoEditSheet";
import FaceCropDialog from "@/components/FaceCropDialog";
import type { Person } from "@/lib/supabase";

const spring = { type: "spring" as const, stiffness: 300, damping: 26 };

const ALL_SLOTS = [
  { label: "Add Mom", tag: "mother" },
  { label: "Add Dad", tag: "father" },
  { label: "Add Grandpa (P)", tag: "paternal_grandpa" },
  { label: "Add Grandma (P)", tag: "paternal_grandma" },
  { label: "Add Grandpa (M)", tag: "maternal_grandpa" },
  { label: "Add Grandma (M)", tag: "maternal_grandma" },
  { label: "Add Sibling", tag: "sibling" },
  { label: "Add Child", tag: "child" },
];

// ── Loading skeleton ───────────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div
      className="flex flex-col items-center min-h-screen px-4 sm:px-8 pt-12 gap-8 pb-24"
      aria-busy="true"
      aria-label="Loading family tree"
    >
      <Skeleton className="h-7 w-36 rounded-lg" />
      <div className="flex flex-row justify-center gap-4 sm:gap-8 w-full max-w-4xl mt-10">
        <Skeleton className="w-[120px] h-32 rounded-3xl" />
        <Skeleton className="w-[120px] h-32 rounded-3xl" />
      </div>
      <Skeleton className="h-12 w-52 rounded-full mt-8" />
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
        className={`relative w-20 h-24 sm:w-24 sm:h-32 rounded-full overflow-hidden border-2 transition-colors cursor-pointer ${
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

      const { data } = await createSignedUrlSafe("face-images-raw", path, 900);
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

  // Determine which empty slots still need to be filled based on progressive disclosure
  const filledTags = new Set(family.map((p) => p.relationship_tag));

  const activeEmptySlots = ALL_SLOTS.filter((slot) => {
    // Allow multiple siblings/children
    if (["sibling", "child"].includes(slot.tag)) {
      // Only show child slot if there's already a child (otherwise rely on "Add Another")
      if (slot.tag === "child" && !filledTags.has("child")) return false;
      return true;
    }

    // Unique slots: don't show if already filled
    if (filledTags.has(slot.tag)) return false;

    // Progressive disclosure for Grandparents
    if (slot.tag === "paternal_grandpa" || slot.tag === "paternal_grandma") {
      return filledTags.has("father") || filledTags.has("paternal_grandpa") || filledTags.has("paternal_grandma");
    }

    if (slot.tag === "maternal_grandpa" || slot.tag === "maternal_grandma") {
      return filledTags.has("mother") || filledTags.has("maternal_grandpa") || filledTags.has("maternal_grandma");
    }

    return true; // Mom & Dad by default
  });

  const getTargetSlots = (tags: string[]) => activeEmptySlots.filter((s) => tags.includes(s.tag));

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

        // Purge any prior photos for this person + invalidate prior analyses.
        await replacePersonFaceImages({
          userId: user.id,
          personId: cropPersonId,
          keepFaceImageIds: [inserted.id],
        });

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
      // person_id tells FamilyAdd to replace into the existing row instead
      // of inserting a fresh one (which would orphan the old person).
      navigate(
        `/family/add?tag=${editPerson.relationship_tag}&person_id=${editPerson.id}`,
      );
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
        const { data } = await createSignedUrlSafe("face-images-raw", path, 900);
        url = data?.signedUrl ?? null;
      }
      openEditSheet(person, url);
    };
  };

  const renderMember = (person: Person, delayIndex: number) => (
    <motion.div
      key={person.id}
      className="glass-card p-2 sm:p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-white/10 transition-colors w-[80px] sm:w-[120px] z-10 shrink-0"
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
      <div className="text-center w-full px-0.5">
        <div className="text-[11px] sm:text-sm font-semibold truncate w-full">{person.display_name}</div>
        <div className="text-[9px] sm:text-[10px] text-cyan/80 uppercase tracking-widest truncate w-full mt-0.5">
          {person.relationship_tag.replace(/_/g, " ")}
        </div>
      </div>
    </motion.div>
  );

  const renderEmptySlot = (slot: (typeof ALL_SLOTS)[0], delayIndex: number) => (
    <motion.button
      key={slot.tag}
      className="glass-card border-dashed border-white/20 p-2 sm:p-4 flex flex-col items-center justify-start gap-2 cursor-pointer hover:bg-white/10 transition-colors w-[80px] sm:w-[120px] focus-visible:ring-2 focus-visible:ring-cyan focus-visible:outline-none z-10 shrink-0"
      onClick={() => navigate(`/family/add?tag=${slot.tag}`)}
      aria-label={slot.label}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.2 + delayIndex * 0.05 }}
    >
      <div
        className="w-12 h-14 sm:w-16 sm:h-20 rounded-full border-2 border-dashed border-white/20 flex flex-col items-center justify-center bg-white/5 transition-colors shrink-0"
        style={{ borderRadius: "50% / 50%" }}
      >
        <Plus size={18} className="text-muted-foreground sm:w-6 sm:h-6" aria-hidden="true" />
      </div>
      <div className="text-center w-full px-0.5">
        <div className="text-[10px] sm:text-xs text-muted-foreground font-medium leading-tight">{slot.label}</div>
      </div>
    </motion.button>
  );

  const renderNodeGroup = (tags: string[]) => {
    const members = family.filter((f) => tags.includes(f.relationship_tag));
    const groupEmptySlots = getTargetSlots(tags);

    return (
      <>
        {members.map((p, i) => renderMember(p, i))}
        {groupEmptySlots.map((s, i) => renderEmptySlot(s, members.length + i))}
      </>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col items-center min-h-screen px-2 sm:px-8 pt-6 sm:pt-12 gap-8 pb-32 max-w-5xl mx-auto w-full relative overflow-x-hidden">
      <motion.h1
        className="text-2xl sm:text-3xl font-bold tracking-tight"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={spring}
      >
        Family Tree
      </motion.h1>

      <div className="flex flex-col items-center w-full relative mt-2 gap-8 sm:gap-14">
        {/* --- TIER 1: Grandparents & Parents --- */}
        <div className="flex flex-row justify-between w-full max-w-4xl relative gap-2 sm:gap-8 bg-black/20 rounded-3xl p-3 sm:p-8 border border-white/5 mx-auto">
          {/* Central Divider */}
          <div className="absolute top-8 bottom-8 left-1/2 w-px bg-white/10 -translate-x-1/2 pointer-events-none hidden sm:block" />

          {/* PATERNAL BRANCH */}
          <div className="flex flex-col items-center w-1/2 relative gap-4 sm:gap-8">
            <h3 className="text-[10px] sm:text-xs tracking-widest uppercase font-bold text-cyan/60 bg-background/50 px-3 py-1 rounded-full border border-cyan/10">
              Paternal
            </h3>

            {(filledTags.has("father") || filledTags.has("paternal_grandpa") || filledTags.has("paternal_grandma")) && (
              <div className="flex flex-col items-center gap-2 sm:gap-4 w-full">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50 hidden sm:block">
                  Grandparents
                </div>
                <div className="flex flex-row flex-wrap justify-center gap-2 sm:gap-4 w-full">
                  {renderNodeGroup(["paternal_grandpa", "paternal_grandma"])}
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-2 sm:gap-4 w-full mt-auto">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50 hidden sm:block">Parent</div>
              <div className="flex justify-center w-full">{renderNodeGroup(["father"])}</div>
            </div>
          </div>

          {/* MATERNAL BRANCH */}
          <div className="flex flex-col items-center w-1/2 relative gap-4 sm:gap-8">
            <h3 className="text-[10px] sm:text-xs tracking-widest uppercase font-bold text-pink-500/60 bg-background/50 px-3 py-1 rounded-full border border-pink-500/10">
              Maternal
            </h3>

            {(filledTags.has("mother") || filledTags.has("maternal_grandpa") || filledTags.has("maternal_grandma")) && (
              <div className="flex flex-col items-center gap-2 sm:gap-4 w-full">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50 hidden sm:block">
                  Grandparents
                </div>
                <div className="flex flex-row flex-wrap justify-center gap-2 sm:gap-4 w-full">
                  {renderNodeGroup(["maternal_grandpa", "maternal_grandma"])}
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-2 sm:gap-4 w-full mt-auto">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50 hidden sm:block">Parent</div>
              <div className="flex justify-center w-full">{renderNodeGroup(["mother"])}</div>
            </div>
          </div>
        </div>

        {/* --- TIER 1.5: Extended Family (Aunts/Uncles) --- */}
        {family.some((f) => ["uncle", "aunt"].includes(f.relationship_tag)) && (
          <div className="flex flex-col items-center gap-3 w-full">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-2">
              Extended
            </h3>
            <div className="flex flex-row flex-wrap justify-center gap-2 sm:gap-4 w-full">
              {renderNodeGroup(["uncle", "aunt"])}
            </div>
          </div>
        )}

        {/* --- TIER 0: Self & Siblings --- */}
        <div className="flex flex-col items-center gap-4 w-full relative bg-cyan/5 rounded-3xl p-4 sm:p-8 border border-cyan/10">
          <h3 className="text-[10px] sm:text-xs uppercase tracking-widest text-cyan/70 font-semibold mb-2">
            You & Siblings
          </h3>
          <div className="flex flex-row flex-wrap justify-center items-center gap-3 sm:gap-6 w-full">
            {renderNodeGroup(["sibling", "other"])}

            {/* Self */}
            <div className="mx-1 sm:mx-6 shrink-0 order-first lg:order-none z-10">
              <SelfAvatar
                self={self}
                thumbnailUrl={selfThumbnailUrl}
                facePosition={selfFacePosition}
                onClick={() => navigate("/capture")}
                onEdit={() => self && openEditSheet(self, selfThumbnailUrl)}
              />
            </div>
          </div>
        </div>

        {/* --- TIER -1: Children --- */}
        {(family.some((f) => f.relationship_tag === "child") || activeEmptySlots.some((s) => s.tag === "child")) && (
          <div className="flex flex-col items-center gap-3 w-full bg-black/20 rounded-3xl p-4 sm:p-8 border border-white/5">
            <h3 className="text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground/60 font-semibold mb-2">
              Children
            </h3>
            <div className="flex flex-row flex-wrap justify-center gap-2 sm:gap-4 w-full">
              {renderNodeGroup(["child"])}
            </div>
          </div>
        )}

        {/* Generic Add Button */}
        <motion.button
          className="mt-2 flex items-center gap-2 px-6 py-2.5 rounded-full border border-dashed border-white/20 text-xs sm:text-sm font-medium hover:bg-white/10 transition-colors text-muted-foreground/80 hover:text-white"
          onClick={() => navigate("/family/add?tag=other")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus size={16} />
          Add Another Relative
        </motion.button>
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

      const { data } = await createSignedUrlSafe("face-images-raw", path, 900);
      return data?.signedUrl ?? null;
    },
  });

  return (
    <div
      className="w-12 h-14 sm:w-16 sm:h-20 rounded-full overflow-hidden border border-white/15 bg-white/10 flex items-center justify-center shrink-0"
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
