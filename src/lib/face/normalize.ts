/**
 * Image normalization helpers for consistent portrait storage.
 *
 * We store uploaded raw portraits in a fixed 3:4 portrait ratio to avoid
 * stretched-looking thumbnails across mixed source aspect ratios.
 */

const TARGET_WIDTH = 768;
const TARGET_HEIGHT = 1024; // 3:4 portrait

/**
 * Convert an arbitrary image blob to a 3:4 portrait JPEG by center-cropping
 * (no geometric stretching).
 */
export async function normalizeToPortrait(blob: Blob): Promise<Blob> {
  const img = await loadImageFromBlob(blob);
  const targetAspect = TARGET_WIDTH / TARGET_HEIGHT;
  const srcAspect = img.naturalWidth / img.naturalHeight;

  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  // Center-crop to match target aspect
  if (srcAspect > targetAspect) {
    // Source is wider than target: crop left/right
    sw = img.naturalHeight * targetAspect;
    sx = (img.naturalWidth - sw) / 2;
  } else if (srcAspect < targetAspect) {
    // Source is taller than target: crop top/bottom
    sh = img.naturalWidth / targetAspect;
    sy = (img.naturalHeight - sh) / 2;
  }

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_WIDTH;
  canvas.height = TARGET_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => {
        if (!out) reject(new Error('Failed to encode normalized image'));
        else resolve(out);
      },
      'image/jpeg',
      0.92,
    );
  });
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image blob'));
    };
    img.src = url;
  });
}
