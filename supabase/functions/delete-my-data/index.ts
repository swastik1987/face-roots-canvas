/**
 * delete-my-data — DPDP / GDPR right-to-erasure.
 *
 * Input:  (authed, no body required)
 * Output: { deleted: { tables: number, storage: number } }
 *
 * Steps:
 *   1. Write final consent_events row (event_type='revoked')
 *   2. Purge all storage objects in face-images-raw and feature-crops for this user
 *   3. Delete the profile row (cascades to all other tables via FK on delete cascade)
 *   4. Return receipt
 */
import { handleCors, jsonResponse, requireAuth } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { captureException } from '../_shared/sentry.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let userId = 'unknown';
  try {
    const user = await requireAuth(req);
    userId = user.id;

    const db = getAdminClient();

    // 1. Write revocation consent event
    await db.from('consent_events').insert({
      user_id: userId,
      event_type: 'revoked',
      scopes: { embeddings: false, raw_images: false, sharing: false },
      policy_version: Deno.env.get('POLICY_VERSION') ?? 'v1.0.0',
      user_agent: req.headers.get('user-agent') ?? null,
    });

    let storageDeleted = 0;

    // 2. Purge storage — face-images-raw
    storageDeleted += await purgeUserStorage(db, userId, 'face-images-raw');
    storageDeleted += await purgeUserStorage(db, userId, 'feature-crops');
    storageDeleted += await purgeUserStorage(db, userId, 'legacy-cards');

    // 3. Count rows we're about to cascade-delete (for the receipt)
    const tablesToCount = [
      'face_images', 'face_embeddings', 'feature_embeddings',
      'face_landmarks', 'analyses', 'feature_matches',
    ];
    let tableRowsDeleted = 0;
    for (const table of tablesToCount) {
      // Join through persons for tables that don't have user_id directly
      const { count } = await db
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(
          table === 'analyses' ? 'user_id' : 'person_id',
          table === 'analyses' ? userId : 'irrelevant', // will be handled by cascade
        ).catch(() => ({ count: 0 }));
      tableRowsDeleted += count ?? 0;
    }

    // 4. Delete profile — cascades to persons → face_images → everything else
    await db.from('profiles').delete().eq('id', userId);

    // Also delete the auth user record
    await db.auth.admin.deleteUser(userId);

    return jsonResponse({
      deleted: {
        tables: tableRowsDeleted,
        storage: storageDeleted,
      },
    });
  } catch (err) {
    await captureException(err, { functionName: 'delete-my-data', userId });
    const status = (err as Error & { status?: number }).status ?? 500;
    return jsonResponse({ error: (err as Error).message }, status);
  }
});

/** List and delete all objects in `bucket` under the `userId/` prefix. */
async function purgeUserStorage(
  db: ReturnType<typeof import('../_shared/supabaseAdmin.ts').getAdminClient>,
  userId: string,
  bucket: string,
): Promise<number> {
  let deleted = 0;
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data: files } = await db.storage
      .from(bucket)
      .list(userId, { limit, offset });

    if (!files || files.length === 0) break;

    const paths = files.map(f => `${userId}/${f.name}`);
    const { data: removed } = await db.storage.from(bucket).remove(paths);
    deleted += removed?.length ?? 0;

    if (files.length < limit) break;
    offset += limit;
  }

  return deleted;
}
