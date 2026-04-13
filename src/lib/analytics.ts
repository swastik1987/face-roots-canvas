/**
 * PostHog analytics — stub until Phase 6.
 * posthog-js will be added to package.json in Phase 6 when full
 * funnel instrumentation is implemented.
 */

export function initAnalytics(): void {
  // Phase 6: import posthog-js and call ph.init(VITE_POSTHOG_KEY, {...})
}

export function identifyUser(_userId: string): void {
  // Phase 6
}

export function captureEvent(_name: string, _properties?: Record<string, unknown>): void {
  // Phase 6
}

export function resetAnalytics(): void {
  // Phase 6
}
