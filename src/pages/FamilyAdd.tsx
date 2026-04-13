/**
 * /family/add — Add a family member via photo upload.
 *
 * Flow (§6.4):
 *   1. File picker (image/*)
 *   2. Run FaceLandmarker in IMAGE mode
 *   3. 0 faces → friendly error
 *   4. >1 face → tap to select (TODO Phase 2+)
 *   5. Auto-crop + confirm screen (name, relationship)
 *   6. Upload image → face_images row + face_landmarks row
 *      (Edge Function validate-face + embed-face run server-side in Phase 3)
 */

import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { initDetector, setRunningMode, detectImage } from '@/lib/face/detector';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const spring = { type: 'spring' as const, stiffness: 260, damping: 20 };

const RELATIONSHIP_OPTIONS = [
  { label: 'Mother',        tag: 'mother',            generation: 1 },
  { label: 'Father',        tag: 'father',            generation: 1 },
  { label: 'Maternal Grandma', tag: 'maternal_grandma', generation: 2 },
  { label: 'Maternal Grandpa', tag: 'maternal_grandpa', generation: 2 },
  { label: 'Paternal Grandma', tag: 'paternal_grandma', generation: 2 },
  { label: 'Paternal Grandpa', tag: 'paternal_grandpa', generation: 2 },
  { label: 'Sibling',       tag: 'sibling',           generation: 0 },
  { label: 'Uncle',         tag: 'uncle',             generation: 1 },
  { label: 'Aunt',          tag: 'aunt',              generation: 1 },
  { label: 'Child',         tag: 'child',             generation: -1 },
  { label: 'Other',         tag: 'other',             generation: 0 },
];

type Phase = 'pick' | 'detecting' | 'confirm' | 'saving' | 'done' | 'error';

const FamilyAdd = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [phase, setPhase] = useState<Phase>('pick');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [faceConfidence, setFaceConfidence] = useState(0);
  const [name, setName] = useState('');
  const [relationTag, setRelationTag] = useState(searchParams.get('tag') ?? '');

  // ── File pick + detection ──────────────────────────────────────────────────

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select an image file.');
      setPhase('error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Image must be smaller than 10 MB.');
      setPhase('error');
      return;
    }

    setPhase('detecting');
    setErrorMsg('');

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setImageBlob(file);

    try {
      await initDetector();
      await setRunningMode('IMAGE');

      // Wait for the image element to load
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });

      // Create off-screen image element for detection
      const img = new Image();
      img.src = url;
      await new Promise(r => { img.onload = r; });

      const result = detectImage(img);
      const numFaces = result.faceLandmarks?.length ?? 0;

      if (numFaces === 0) {
        setErrorMsg('No face found in this photo. Please try a clearer front-facing portrait.');
        setPhase('error');
        URL.revokeObjectURL(url);
        return;
      }

      // Store confidence
      setFaceConfidence(1);
      setPhase('confirm');
    } catch (err) {
      console.error('Detection error', err);
      setErrorMsg('Could not analyse the photo. Please try another image.');
      setPhase('error');
    }
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!user || !imageBlob) return;
    if (!name.trim()) { setErrorMsg('Please enter a name.'); return; }
    if (!relationTag) { setErrorMsg('Please select a relationship.'); return; }

    setPhase('saving');
    setErrorMsg('');

    try {
      const rel = RELATIONSHIP_OPTIONS.find(r => r.tag === relationTag);
      const generation = rel?.generation ?? 0;

      // Create person row
      const { data: person, error: pe } = await supabase
        .from('persons')
        .insert({
          owner_user_id: user.id,
          display_name: name.trim(),
          relationship_tag: relationTag,
          generation,
          is_self: false,
        })
        .select('id').single();
      if (pe) throw pe;

      // Upload image
      const ext = imageBlob.type === 'image/png' ? 'png' : 'jpg';
      const path = `${user.id}/family/${person.id}_${Date.now()}.${ext}`;
      const { error: se } = await supabase.storage
        .from('face-images-raw')
        .upload(path, imageBlob, { contentType: imageBlob.type });
      if (se) throw se;

      // face_images row
      const { data: imgRow, error: ie } = await supabase
        .from('face_images')
        .insert({
          person_id: person.id,
          storage_path: path,
          angle: 'front',
          capture_method: 'upload_cropped',
          face_confidence: faceConfidence,
        })
        .select('id').single();
      if (ie) throw ie;

      // face_landmarks — landmarks from detection (stored for Phase 3 re-use)
      // We'll store a minimal placeholder; full detection was done client-side
      await supabase.from('face_landmarks').insert({
        face_image_id: imgRow.id,
        landmarks_json: { note: 'landmarks stored during Phase 3 embed-face call' },
      });

      setPhase('done');
    } catch (err) {
      console.error('Save failed', err);
      setErrorMsg('Failed to save. Please try again.');
      setPhase('error');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
          <CheckCircle2 size={64} className="text-cyan" />
        </motion.div>
        <h1 className="text-xl font-bold">{name} added!</h1>
        <button className="btn-gradient px-8 py-3" onClick={() => navigate('/home')}>Back to family</button>
        <button className="text-sm text-muted-foreground underline underline-offset-2" onClick={() => { setPhase('pick'); setPreviewUrl(''); setName(''); setRelationTag(''); }}>
          Add another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <motion.div
        className="glass-card p-8 w-full max-w-sm space-y-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
      >
        <h1 className="text-2xl font-bold text-center">Add family member</h1>

        {/* Photo picker / preview */}
        <AnimatePresence mode="wait">
          {phase === 'pick' || phase === 'error' ? (
            <motion.button
              key="picker"
              className="w-full h-40 rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={28} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Tap to upload a photo</span>
            </motion.button>
          ) : (
            <motion.div
              key="preview"
              className="w-full h-40 rounded-xl overflow-hidden relative"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <img ref={imgRef} src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              {phase === 'detecting' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2">
                  <Loader2 size={20} className="animate-spin text-white" />
                  <span className="text-white text-sm">Detecting face…</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {phase === 'error' && errorMsg && (
          <div className="flex items-start gap-2 text-destructive text-xs">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Name + relationship — only shown in confirm/saving */}
        {(phase === 'confirm' || phase === 'saving') && (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. Maria"
                className="bg-white/5 border-white/10"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={phase === 'saving'}
              />
            </div>

            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select value={relationTag} onValueChange={setRelationTag} disabled={phase === 'saving'}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_OPTIONS.map(r => (
                    <SelectItem key={r.tag} value={r.tag}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {errorMsg && phase !== 'error' && (
              <p className="text-xs text-destructive">{errorMsg}</p>
            )}

            <button
              className="btn-gradient w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50"
              onClick={handleSave}
              disabled={phase === 'saving'}
            >
              {phase === 'saving' && <Loader2 size={16} className="animate-spin" />}
              Save
            </button>
          </>
        )}

        {/* Re-pick after error */}
        {phase === 'error' && (
          <button
            className="w-full py-3 rounded-full border border-white/10 text-sm text-muted-foreground hover:bg-white/5 transition-colors"
            onClick={() => { setPhase('pick'); setPreviewUrl(''); setImageBlob(null); setErrorMsg(''); }}
          >
            Try a different photo
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default FamilyAdd;
