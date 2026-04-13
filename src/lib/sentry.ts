/**
 * Sentry error tracking — thin wrapper.
 * All calls are no-ops when VITE_SENTRY_DSN is not set.
 */

export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn,
    release: import.meta.env.VITE_APP_VERSION ?? 'dev',
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    // Do not send PII
    beforeSend(event) {
      // Strip email from user context just in case
      if (event.user) delete event.user.email;
      return event;
    },
  });
}

export async function setSentryUser(userId: string) {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  const Sentry = await import('@sentry/react');
  Sentry.setUser({ id: userId });
}

export async function clearSentryUser() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  const Sentry = await import('@sentry/react');
  Sentry.setUser(null);
}
