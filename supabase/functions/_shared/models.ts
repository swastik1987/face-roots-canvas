/** Canonical model version strings — bump here when upgrading a model. */
export const MODEL_VERSIONS = {
  face: 'clip-vit-large-patch14@2024-01',
  features: 'clip-vit-large-patch14@2024-01',
  llm: 'gemini-2.5-flash',
} as const;

export type ModelVersions = typeof MODEL_VERSIONS;
