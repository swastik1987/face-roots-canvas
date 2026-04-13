-- ============================================================
-- Migration 0006: Add card_storage_path to analyses
-- Stores the legacy-cards bucket path for the rendered PNG.
-- Populated by render-legacy-card Edge Function after analysis.
-- ============================================================

alter table analyses
  add column if not exists card_storage_path text;
