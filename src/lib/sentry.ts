/**
 * Sentry error tracking — Phase 6 implementation.
 *
 * Uses @sentry/react for automatic React error boundary + breadcrumb capture.
 * All calls are no-ops when VITE_SENTRY_DSN is absent.
 *
 * NOTE: This file is .ts (not .tsx) — no JSX here.
 * The <Sentry.ErrorBoundary> component is used directly in App.tsx.
 */

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    tracesSampleRate: 0.2,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    beforeSend(event) {
      // Strip PII: remove user email from events
      if (event.user) delete event.user.email;
      return event;
    },
  });
}

export function setSentryUser(userId: string): void {
  if (!DSN) return;
  Sentry.setUser({ id: userId });
}

export function clearSentryUser(): void {
  if (!DSN) return;
  Sentry.setUser(null);
}

/** The Sentry ErrorBoundary component — use this in .tsx files only. */
export const SentryErrorBoundary = Sentry.ErrorBoundary;

/** Whether Sentry is configured (used to conditionally render the boundary). */
export const isSentryEnabled = !!DSN;

/**
 * Report an exception to Sentry with optional tagged context.
 * No-op when Sentry isn't configured — still logs to console so local dev
 * sees the failure.
 */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  // Always surface to console so non-Sentry environments aren't silent.
  if (context) {
    console.error("[sentry]", err, context);
  } else {
    console.error("[sentry]", err);
  }
  if (!DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/** Record a breadcrumb / informational message. */
export function captureMessage(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (!DSN) {
    console.info("[sentry]", message, context ?? "");
    return;
  }
  Sentry.captureMessage(message, context ? { extra: context } : undefined);
}
