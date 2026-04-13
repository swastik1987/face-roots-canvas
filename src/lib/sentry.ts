/**
 * Sentry error tracking — stub until Phase 6.
 * @sentry/react will be added to package.json in Phase 6 when full
 * error monitoring is implemented for frontend + Edge Functions.
 */

export function initSentry(): void {
  // Phase 6: import @sentry/react and call Sentry.init({dsn: VITE_SENTRY_DSN, ...})
}

export function setSentryUser(_userId: string): void {
  // Phase 6
}

export function clearSentryUser(): void {
  // Phase 6
}
