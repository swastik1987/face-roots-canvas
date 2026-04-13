/**
 * PostHog analytics — thin wrapper so we can swap providers later.
 * All calls are no-ops when VITE_POSTHOG_KEY is not set (local dev without analytics).
 */

let posthog: typeof import('posthog-js').default | null = null;

export async function initAnalytics() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;

  const { default: ph } = await import('posthog-js');
  ph.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com',
    autocapture: false,       // manual capture only — avoid leaking PII
    capture_pageview: true,
    persistence: 'localStorage',
    loaded: instance => {
      posthog = instance;
    },
  });
}

export function identifyUser(userId: string) {
  posthog?.identify(userId);
}

export function captureEvent(name: string, properties?: Record<string, unknown>) {
  posthog?.capture(name, properties);
}

export function resetAnalytics() {
  posthog?.reset();
}
