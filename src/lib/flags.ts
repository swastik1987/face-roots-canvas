/**
 * Feature flags — Phase 7.
 *
 * Flag names are defined as constants so typos are caught at compile time.
 * `useFeatureFlag` is a thin wrapper around PostHog's `useFeatureFlagEnabled`
 * that returns false when PostHog is not configured (local dev / preview).
 *
 * PostHog flags to create in the dashboard:
 *   mystery-match   — enables the Mystery Match mode tab + routes
 *   sibling-mode    — enables the Sibling Mode entry point
 *   time-machine    — enables the Time Machine entry point
 */

import { useFeatureFlagEnabled } from 'posthog-js/react';

// ── Flag name constants ───────────────────────────────────────────────────────

export const FLAG_MYSTERY_MATCH = 'mystery-match' as const;
export const FLAG_SIBLING_MODE  = 'sibling-mode'  as const;
export const FLAG_TIME_MACHINE  = 'time-machine'  as const;

// ── Hook ──────────────────────────────────────────────────────────────────────

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

/**
 * Returns true when the named PostHog flag is enabled for the current user.
 * Always returns false in environments without VITE_POSTHOG_KEY.
 */
export function useFeatureFlag(flag: string): boolean {
  // PostHog hook must always be called (no conditional hooks).
  // When KEY is absent the posthog instance is a no-op and the hook returns false.
  const enabled = useFeatureFlagEnabled(flag);
  if (!KEY) return false;
  return !!enabled;
}
