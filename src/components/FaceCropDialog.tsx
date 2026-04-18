/**
 * FaceCropDialog — full-screen dialog for cropping a face from an image.
 *
 * Features:
 *   - Circular guide overlay to help the user centre on the face
 *   - MediaPipe auto-detection to suggest initial crop position
 *   - Drag to pan, pinch/scroll to zoom
 *   - On confirm: returns a cropped blob (512×512 square, face centred)
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { initDetector, setRunningMode, detectImage } from "@/lib/face/detector";

interface FaceCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The image URL to crop (signed URL or object URL). */
  imageUrl: string;
  /** Called with the cropped face blob + data URL on confirm. */
  onCropConfirm: (blob: Blob, dataUrl: string) => void;
}

/** Compute face centre (normalised 0-1) from all landmarks. */
function getFaceCentre(landmarks: Array<{ x: number; y: number; z: number }>): {
  cx: number;
  cy: number;
  radius: number;
} {
  const xs = landmarks.map((l) => l.x);
  const ys = landmarks.map((l) => l.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const bw = maxX - minX;
  const bh = maxY - minY;
  // Radius: half the larger dimension + 25% padding
  const radius = (Math.max(bw, bh) / 2) * 1.25;
  return { cx, cy, radius };
}

const CROP_SIZE = 512;

export default function FaceCropDialog({ open, onOpenChange, imageUrl, onCropConfirm }: FaceCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Transform state: offset (in image-normalised coords) + scale
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(1);

  // Drag state
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const GUIDE_RATIO_X = 0.35; // 35% of canvas width
  const GUIDE_RATIO_Y = 0.45; // 45% of canvas height (oval aspect)

  // Load image + run face detection on open
  useEffect(() => {
    if (!open || !imageUrl) return;
    setLoading(true);
    setImgLoaded(false);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = async () => {
      imgRef.current = img;
      setImgLoaded(true);

      try {
        await initDetector();
        await setRunningMode("IMAGE");
        const result = detectImage(img);
        const faces = result.faceLandmarks ?? [];

        if (faces.length > 0) {
          const { cx, cy, radius } = getFaceCentre(faces[0]);
          // Calculate scale + offset so the face fills the guide oval
          const guideNorm = GUIDE_RATIO_Y; // scale based on height
          const newScale = guideNorm / radius;
          setScale(Math.min(Math.max(newScale, 1), 5));
          setOffsetX(0.5 - cx);
          setOffsetY(0.5 - cy);
        } else {
          // No face found — centre the image, default zoom
          setScale(1);
          setOffsetX(0);
          setOffsetY(0);
        }
      } catch {
        // Detection failed — just show image centred
        setScale(1);
        setOffsetX(0);
        setOffsetY(0);
      }
      setLoading(false);
    };
    img.onerror = () => {
      setLoading(false);
    };
  }, [open, imageUrl]);

  // Draw the image + circular guide overlay
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    // Compute draw rect: image is drawn centred, then offset + scaled
    const imgAspect = img.naturalWidth / img.naturalHeight;
    let drawW: number, drawH: number;
    if (imgAspect > 1) {
      drawH = h * scale;
      drawW = drawH * imgAspect;
    } else {
      drawW = w * scale;
      drawH = drawW / imgAspect;
    }

    const dx = (w - drawW) / 2 + offsetX * drawW;
    const dy = (h - drawH) / 2 + offsetY * drawH;

    ctx.drawImage(img, dx, dy, drawW, drawH);

    // Dark overlay outside the oval
    const guideRX = w * GUIDE_RATIO_X;
    const guideRY = h * GUIDE_RATIO_Y;
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.ellipse(cx, cy, guideRX, guideRY, 0, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();

    // Oval border
    ctx.strokeStyle = "rgba(0, 229, 255, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, guideRX, guideRY, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle cross-hair at centre
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy);
    ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();
  }, [offsetX, offsetY, scale]);

  useEffect(() => {
    if (imgLoaded && !loading) {
      requestAnimationFrame(draw);
    }
  }, [imgLoaded, loading, draw]);

  // ── Pointer drag handlers ───────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const dx = (e.clientX - dragStart.current.x) / canvas.clientWidth / scale;
    const dy = (e.clientY - dragStart.current.y) / canvas.clientHeight / scale;
    setOffsetX(dragStart.current.ox + dx);
    setOffsetY(dragStart.current.oy + dy);
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  // Scroll/pinch to zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(Math.max(s - e.deltaY * 0.002, 0.5), 5));
  };

  const zoomIn = () => setScale((s) => Math.min(s + 0.3, 5));
  const zoomOut = () => setScale((s) => Math.max(s - 0.3, 0.5));
  const resetView = () => {
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  // ── Crop + confirm ──────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    // Reproduce the same draw logic to figure out source rect
    const w = canvas.width;
    const h = canvas.height;

    const imgAspect = img.naturalWidth / img.naturalHeight;
    let drawW: number, drawH: number;
    if (imgAspect > 1) {
      drawH = h * scale;
      drawW = drawH * imgAspect;
    } else {
      drawW = w * scale;
      drawH = drawW / imgAspect;
    }

    const dx = (w - drawW) / 2 + offsetX * drawW;
    const dy = (h - drawH) / 2 + offsetY * drawH;

    const guideRX = w * GUIDE_RATIO_X;
    const guideRY = h * GUIDE_RATIO_Y;
    const cx = w / 2;
    const cy = h / 2;

    // The guide oval bounds in image-pixel space
    const scaleToImg = img.naturalWidth / drawW;
    const srcCx = (cx - dx) * scaleToImg;
    const srcCy = (cy - dy) * scaleToImg;
    const srcRX = guideRX * scaleToImg;
    const srcRY = guideRY * scaleToImg;

    // Extract a bounding box around the oval, preserving aspect ratio of the bounding box
    const out = document.createElement("canvas");
    // Using 512x512 canvas still but adjusting what we draw
    out.width = CROP_SIZE;
    out.height = CROP_SIZE;
    const octx = out.getContext("2d")!;

    // We'll mask to the oval output
    octx.beginPath();
    octx.ellipse(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, 0, Math.PI * 2);
    octx.clip();

    // We draw the bounding rect of the oval. Max dimension regulates the square crop
    const maxDimensionR = Math.max(srcRX, srcRY);

    octx.drawImage(
      img,
      srcCx - maxDimensionR,
      srcCy - maxDimensionR,
      maxDimensionR * 2,
      maxDimensionR * 2,
      0,
      0,
      CROP_SIZE,
      CROP_SIZE,
    );

    const dataUrl = out.toDataURL("image/png");

    // Also produce a square (non-clipped) version for storage
    const sq = document.createElement("canvas");
    sq.width = CROP_SIZE;
    sq.height = CROP_SIZE;
    const sqctx = sq.getContext("2d")!;
    sqctx.drawImage(
      img,
      srcCx - maxDimensionR,
      srcCy - maxDimensionR,
      maxDimensionR * 2,
      maxDimensionR * 2,
      0,
      0,
      CROP_SIZE,
      CROP_SIZE,
    );

    const blob = await new Promise<Blob>((resolve) => sq.toBlob((b) => resolve(b!), "image/jpeg", 0.92));

    onCropConfirm(blob, dataUrl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-background border-white/10">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-base">Crop face</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Position the face inside the oval. Drag to move, scroll to zoom.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full aspect-square bg-black">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2">
              <Loader2 size={20} className="animate-spin text-cyan" />
              <span className="text-sm text-muted-foreground">Detecting face...</span>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              width={512}
              height={512}
              className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
            />
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center justify-center gap-3 px-6 py-2">
          <button
            onClick={zoomOut}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={zoomIn}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={resetView}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors ml-2"
            aria-label="Reset view"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 pb-6">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-muted-foreground hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 btn-gradient py-2.5 text-sm font-medium disabled:opacity-40"
          >
            Confirm crop
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
