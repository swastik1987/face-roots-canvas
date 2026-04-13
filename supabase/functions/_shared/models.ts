/** Canonical model version strings — bump here when upgrading a model. */
export const MODEL_VERSIONS = {
  face: 'buffalo_l@2024-02',
  features: 'dinov2-vits14@2024-01',
  llm: 'gemini-2.5-flash',
} as const;

export type ModelVersions = typeof MODEL_VERSIONS;
