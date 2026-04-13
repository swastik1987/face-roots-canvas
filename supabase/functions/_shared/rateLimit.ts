/**
 * Rate-limit check using the rate_limit_events table.
 * Throws a 429-flavoured Error if the user is over their quota.
 */
import { getAdminClient } from './supabaseAdmin.ts';

interface RateLimitOptions {
  userId: string;
  action: string;
  /** Window in seconds (default 86400 = 1 day). */
  windowSecs?: number;
  /** Max allowed calls within the window. */
  maxCalls: number;
}

/**
 * Record an event and throw if the user is over limit.
 * Call this BEFORE performing the expensive action.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<void> {
  const { userId, action, windowSecs = 86400, maxCalls } = opts;
  const db = getAdminClient();

  const since = new Date(Date.now() - windowSecs * 1000).toISOString();

  const { count, error } = await db
    .from('rate_limit_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', since);

  if (error) throw new Error(`Rate limit check failed: ${error.message}`);

  if ((count ?? 0) >= maxCalls) {
    const err = new Error(`Rate limit exceeded for action "${action}". Max ${maxCalls} per ${windowSecs}s.`);
    (err as Error & { status: number }).status = 429;
    throw err;
  }

  // Record this call
  await db.from('rate_limit_events').insert({ user_id: userId, action });
}
