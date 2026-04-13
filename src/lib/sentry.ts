/**
 * Sentry error tracking — Phase 6 implementation.
 *
 * Uses @sentry/react for automatic React error boundary + breadcrumb capture.
 * All calls are no-ops when VITE_SENTRY_DSN is absent.
 */

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    tracesSampleRate: 0.2,           // 20% of transactions sampled
    replaysOnErrorSampleRate: 0.5,   // record replay on errors
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    beforeSend(event) {
      // Strip PII: remove user email from breadcrumbs
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

/** Wrap a component with Sentry's React ErrorBoundary. */
export const SentryErrorBoundary = DSN ? Sentry.ErrorBoundary : FallbackBoundary;

function FallbackBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
