/**
 * Thin Sentry wrapper for Edge Functions.
 * Captures exceptions and sends them to Sentry via the REST API.
 * We do not use the full Sentry SDK to keep cold-start weight low.
 */

const DSN = Deno.env.get('SENTRY_DSN_EDGE');

/** Parse the Sentry DSN into its components. */
function parseDsn(dsn: string) {
  const url = new URL(dsn);
  const [publicKey] = url.username.split(':');
  const projectId = url.pathname.replace('/', '');
  const storeUrl = `${url.protocol}//${url.host}/api/${projectId}/store/`;
  return { publicKey, storeUrl };
}

/**
 * Capture an exception. Fire-and-forget — does not throw.
 * Pass `context` for additional data (tags, extra).
 */
export async function captureException(
  err: unknown,
  context?: { functionName?: string; userId?: string; extra?: Record<string, unknown> },
): Promise<void> {
  if (!DSN) return;
  try {
    const { publicKey, storeUrl } = parseDsn(DSN);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    const payload = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      level: 'error',
      environment: Deno.env.get('SUPABASE_ENV') ?? 'production',
      exception: {
        values: [{
          type: err instanceof Error ? err.constructor.name : 'Error',
          value: message,
          stacktrace: stack
            ? { frames: stack.split('\n').slice(1).map(line => ({ filename: line.trim() })) }
            : undefined,
        }],
      },
      tags: { function: context?.functionName ?? 'unknown' },
      user: context?.userId ? { id: context.userId } : undefined,
      extra: context?.extra,
    };

    await fetch(storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Never let Sentry reporting crash the function
  }
}
