/**
 * Client-side CLIP embeddings via Transformers.js (ONNX Runtime Web).
 *
 * Uses CLIP ViT-B/32 (quantized, ~22MB vision encoder) to generate
 * 512-dim feature embeddings entirely in the browser. No API calls,
 * no API keys, no billing — images never leave the device for embedding.
 *
 * The model is downloaded once from HuggingFace CDN and cached in
 * the browser's Cache Storage via Transformers.js.
 */

import { pipeline, env, type ImageFeatureExtractionPipeline } from '@huggingface/transformers';

// Use CDN for model files, no local model hosting needed
env.allowLocalModels = false;

/** The HuggingFace model ID — CLIP ViT-B/32, quantized for browser use */
const MODEL_ID = 'Xenova/clip-vit-base-patch32';

/** Model version string for stamping in feature_embeddings rows */
export const CLIP_MODEL_VERSION = 'clip-vit-base-patch32-onnx-q8';

/** Expected embedding dimension */
export const EMBEDDING_DIM = 512;

/** Singleton pipeline instance — loaded lazily on first use */
let pipelineInstance: ImageFeatureExtractionPipeline | null = null;
let loadingPromise: Promise<ImageFeatureExtractionPipeline> | null = null;

/**
 * Get or initialize the CLIP image feature extraction pipeline.
 * Downloads the model on first call (~22MB quantized), then caches.
 *
 * @param onProgress  Optional callback for download progress
 */
export async function getEmbedder(
  onProgress?: (progress: { status: string; progress?: number }) => void,
): Promise<ImageFeatureExtractionPipeline> {
  if (pipelineInstance) return pipelineInstance;

  if (!loadingPromise) {
    loadingPromise = pipeline('image-feature-extraction', MODEL_ID, {
      dtype: 'q8',  // quantized for smaller download + faster inference
      progress_callback: onProgress,
    }) as Promise<ImageFeatureExtractionPipeline>;
  }

  pipelineInstance = await loadingPromise;
  return pipelineInstance;
}

/**
 * Generate a CLIP embedding for a single image blob.
 *
 * @param blob  PNG/JPEG image blob (typically a 224×224 feature crop)
 * @returns 512-dim Float32Array embedding, L2-normalized
 */
export async function embedImage(blob: Blob): Promise<number[]> {
  const embedder = await getEmbedder();

  // Convert blob to a data URL that Transformers.js can read
  const dataUrl = await blobToDataUrl(blob);

  // Run the CLIP vision encoder — CLIP ViT-B/32 returns pooled [1, 512] natively
  const output = await embedder(dataUrl);

  // Extract the raw embedding and L2-normalize it
  const raw = Array.from(output.data as Float32Array);
  const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0)) || 1;
  const embedding = raw.map(v => v / norm);

  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `CLIP returned ${embedding.length}-dim embedding, expected ${EMBEDDING_DIM}`,
    );
  }

  return embedding;
}

/**
 * Batch-embed multiple image blobs.
 * Processes sequentially to avoid memory pressure on mobile devices.
 *
 * @param blobs  Array of image blobs with their feature types
 * @param onProgress  Optional callback: (completed, total) => void
 * @returns Array of { featureType, embedding } results
 */
export async function embedBatch(
  blobs: Array<{ featureType: string; blob: Blob }>,
  onProgress?: (done: number, total: number) => void,
): Promise<Array<{ featureType: string; embedding: number[] }>> {
  const results: Array<{ featureType: string; embedding: number[] }> = [];

  for (let i = 0; i < blobs.length; i++) {
    const { featureType, blob } = blobs[i];
    try {
      const embedding = await embedImage(blob);
      results.push({ featureType, embedding });
    } catch (err) {
      console.warn(`[embedder] Failed to embed ${featureType}:`, err);
      // Skip failed crops — don't block the whole batch
    }
    onProgress?.(i + 1, blobs.length);
  }

  return results;
}

/** Convert a Blob to a data URL string. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}
