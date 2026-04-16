/** Canonical model version strings — bump here when upgrading a model. */
export const MODEL_VERSIONS = {
  face: 'clip-vit-base-patch32-onnx-q8',
  features: 'clip-vit-base-patch32-onnx-q8',
  llm: 'gemini-2.5-flash',
} as const;

export type ModelVersions = typeof MODEL_VERSIONS;
