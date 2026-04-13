/**
 * PostHog analytics — Phase 6 implementation.
 *
 * Funnel events tracked:
 *   capture_started   → user lands on /capture
 *   capture_done      → all 3 angles captured & uploaded
 *   analysis_started  → run-analysis RPC triggered
 *   analysis_done     → analysis status reaches 'done'
 *   share_clicked     → user taps Download or Share on /share
 *
 * All calls are no-ops when VITE_POSTHOG_KEY is absent (local dev / preview).
 */

import posthog from 'posthog-js';

const KEY  = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = 'https://app.posthog.com';

let initialised = false;

export function initAnalytics(): void {
  if (!KEY || initialised) return;
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,          // we fire explicit events only
    persistence: 'localStorage',
    disable_session_recording: true, // no screen recording until explicit opt-in
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.debug();
    },
  });
  initialised = true;
}

export function identifyUser(userId: string): void {
  if (!KEY) return;
  posthog.identify(userId);
}

export function captureEvent(
  name: string,
  properties?: Record<string, unknown>,
): void {
  if (!KEY) return;
  posthog.capture(name, properties);
}

export function resetAnalytics(): void {
  if (!KEY) return;
  posthog.reset();
}
