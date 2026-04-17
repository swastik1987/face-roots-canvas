/**
 * delete-my-data — DPDP / GDPR right-to-erasure.
 *
 * Steps:
 *   1. Count rows (for the receipt) BEFORE deletion
 *   2. Write final consent_events row (event_type='revoked')
 *   3. Purge all storage objects in the 3 user-scoped buckets
 *   4. Delete the auth user — this cascades to every public table via FK ON DELETE CASCADE
 *   5. Return receipt
 *
 * After this runs, the same email can sign up fresh.
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

    // 1. Count rows for the receipt (before anything is deleted)
    const personIds: string[] = [];
    const { data: persons } = await db
      .from('persons')
      .select('id')
      .eq('owner_user_id', userId);
    if (persons) personIds.push(...persons.map((p) => p.id));

    let tableRowsDeleted = 0;
    const countOpts = { count: 'exact' as const, head: true };

    // user_id-scoped tables
    for (const table of ['analyses', 'consent_events', 'rate_limit_events'] as const) {
      const { count } = await db.from(table).select('*', countOpts).eq('user_id', userId);
      tableRowsDeleted += count ?? 0;
    }
    // owner_user_id-scoped tables
    for (const table of ['persons', 'sibling_analyses'] as const) {
      const { count } = await db.from(table).select('*', countOpts).eq('owner_user_id', userId);
      tableRowsDeleted += count ?? 0;
    }
    // person_id-scoped child tables
    if (personIds.length > 0) {
      for (const table of ['face_images', 'face_embeddings', 'feature_embeddings'] as const) {
        const { count } = await db.from(table).select('*', countOpts).in('person_id', personIds);
        tableRowsDeleted += count ?? 0;
      }
    }
    // profile row
    tableRowsDeleted += 1;

    // 2. Write revocation consent event (last record before erasure)
    await db.from('consent_events').insert({
      user_id: userId,
      event_type: 'revoked',
      scopes: { embeddings: false, raw_images: false, sharing: false },
      policy_version: Deno.env.get('POLICY_VERSION') ?? 'v1.0.0',
      user_agent: req.headers.get('user-agent') ?? null,
    });

    // 3. Purge storage
    let storageDeleted = 0;
    for (const bucket of ['face-images-raw', 'feature-crops', 'legacy-cards']) {
      storageDeleted += await purgeDirectory(db, bucket, userId);
    }

    // 4. Explicitly delete all user-scoped rows in public schema BEFORE deleting
    //    the auth user. We don't rely on FK cascades because some tables may
    //    not have ON DELETE CASCADE on their reference to auth.users, which
    //    causes auth.admin.deleteUser to fail with "Database error deleting user".

    // 4a. Child tables that reference persons / analyses / face_images
    if (personIds.length > 0) {
      // face_landmarks → face_images → persons
      const { data: faceImgs } = await db
        .from('face_images')
        .select('id')
        .in('person_id', personIds);
      const faceImageIds = (faceImgs ?? []).map((r) => r.id);
      if (faceImageIds.length > 0) {
        await db.from('face_landmarks').delete().in('face_image_id', faceImageIds);
      }
      await db.from('feature_embeddings').delete().in('person_id', personIds);
      await db.from('face_embeddings').delete().in('person_id', personIds);
      await db.from('face_images').delete().in('person_id', personIds);
    }

    // 4b. analyses + their feature_matches
    const { data: analysisRows } = await db
      .from('analyses')
      .select('id')
      .eq('user_id', userId);
    const analysisIds = (analysisRows ?? []).map((r) => r.id);
    if (analysisIds.length > 0) {
      await db.from('feature_matches').delete().in('analysis_id', analysisIds);
    }

    // 4c. sibling analyses + their deltas
    const { data: siblingRows } = await db
      .from('sibling_analyses')
      .select('id')
      .eq('owner_user_id', userId);
    const siblingIds = (siblingRows ?? []).map((r) => r.id);
    if (siblingIds.length > 0) {
      await db.from('sibling_feature_deltas').delete().in('sibling_analysis_id', siblingIds);
    }
    await db.from('sibling_analyses').delete().eq('owner_user_id', userId);

    // 4d. analyses & persons & user-scoped tables
    await db.from('analyses').delete().eq('user_id', userId);
    await db.from('persons').delete().eq('owner_user_id', userId);
    await db.from('rate_limit_events').delete().eq('user_id', userId);
    await db.from('consent_events').delete().eq('user_id', userId);
    await db.from('profiles').delete().eq('id', userId);

    // 5. Now delete the auth user. With all public-schema references gone,
    //    this should succeed and free the email for re-registration.
    const { error: authErr } = await db.auth.admin.deleteUser(userId);
    if (authErr) {
      throw new Error(`Failed to delete auth user: ${authErr.message}`);
    }

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

/** Walk a storage directory recursively, deleting all files found. */
async function purgeDirectory(
  db: ReturnType<typeof import('../_shared/supabaseAdmin.ts').getAdminClient>,
  bucket: string,
  prefix: string,
): Promise<number> {
  let deleted = 0;
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data: entries } = await db.storage
      .from(bucket)
      .list(prefix, { limit, offset });

    if (!entries || entries.length === 0) break;

    const files = entries.filter((e) => e.id !== null);
    const folders = entries.filter((e) => e.id === null);

    if (files.length > 0) {
      const paths = files.map((f) => `${prefix}/${f.name}`);
      const { data: removed } = await db.storage.from(bucket).remove(paths);
      deleted += removed?.length ?? 0;
    }

    for (const folder of folders) {
      deleted += await purgeDirectory(db, bucket, `${prefix}/${folder.name}`);
    }

    if (entries.length < limit) break;
    offset += limit;
  }

  return deleted;
}
