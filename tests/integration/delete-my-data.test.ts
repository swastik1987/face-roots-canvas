/**
 * Integration test: delete-my-data cascade coverage.
 *
 * Seeds a throwaway user with rows in every table that references them
 * (directly or indirectly), plus files in every storage bucket, invokes
 * the delete-my-data Edge Function, then asserts that no row or storage
 * object belonging to that user survives.
 *
 * ## How to run
 *
 *   Requires a running Supabase project (local or cloud) with:
 *     - migrations 0001..0013 applied
 *     - edge function `delete-my-data` deployed
 *     - service-role key available
 *
 *   Set env vars, then run `npm test -- delete-my-data`:
 *     SUPABASE_URL=https://<ref>.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
 *
 *   The test is auto-skipped if either env var is missing, so unit-test
 *   CI without a DB stays green.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const shouldRun = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

// User-scoped tables: rows keyed directly by user_id
const USER_ID_TABLES = [
  "analyses",
  "consent_events",
  "rate_limit_events",
] as const;

// Owner-scoped tables: rows keyed by owner_user_id
const OWNER_TABLES = ["persons", "sibling_analyses"] as const;

// Person-scoped tables: rows reached via person_id
const PERSON_TABLES = [
  "face_images",
  "face_embeddings",
  "feature_embeddings",
] as const;

const BUCKETS = ["face-images-raw", "feature-crops", "legacy-cards"] as const;

describe.skipIf(!shouldRun)("delete-my-data cascade", () => {
  it("leaves zero rows and zero storage objects for the deleted user", async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    // ── 1. Create a throwaway user ──────────────────────────────────────────
    const email = `delete-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const password = `Pw!${Math.random().toString(36).slice(2, 14)}`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createErr, `createUser: ${createErr?.message}`).toBeNull();
    const userId = created!.user!.id;

    try {
      // ── 2. Seed: person (self) + face_image + landmarks + embeddings ─────
      const { data: selfPerson, error: personErr } = await admin
        .from("persons")
        .insert({
          owner_user_id: userId,
          display_name: "Test Self",
          relationship_tag: "self",
          generation: 0,
          is_self: true,
        })
        .select("id")
        .single();
      expect(personErr, `seed person: ${personErr?.message}`).toBeNull();

      const { data: faceImage, error: imgErr } = await admin
        .from("face_images")
        .insert({
          person_id: selfPerson!.id,
          storage_path: `${userId}/${selfPerson!.id}/front.png`,
          angle: "front",
          capture_method: "guided_capture",
          width: 512,
          height: 512,
        })
        .select("id")
        .single();
      expect(imgErr, `seed face_image: ${imgErr?.message}`).toBeNull();

      await admin.from("face_landmarks").insert({
        face_image_id: faceImage!.id,
        landmarks_json: { landmarks: [] },
      });

      const zeros512 = `[${Array(512).fill(0).join(",")}]`;
      await admin.from("face_embeddings").insert({
        person_id: selfPerson!.id,
        face_image_id: faceImage!.id,
        embedding: zeros512,
        model_version: "test",
      });
      await admin.from("feature_embeddings").insert({
        person_id: selfPerson!.id,
        face_image_id: faceImage!.id,
        feature_type: "nose",
        embedding: zeros512,
        model_version: "test",
      });

      // analysis + feature_match
      const { data: analysis } = await admin
        .from("analyses")
        .insert({
          user_id: userId,
          self_person_id: selfPerson!.id,
          status: "done",
        })
        .select("id")
        .single();
      await admin.from("feature_matches").insert({
        analysis_id: analysis!.id,
        feature_type: "nose",
        winner_person_id: selfPerson!.id,
        winner_similarity: 0.5,
      });

      // consent + rate_limit events
      await admin.from("consent_events").insert({
        user_id: userId,
        event_type: "granted",
        scopes: { embeddings: true },
        policy_version: "v1.0.0",
      });
      await admin.from("rate_limit_events").insert({
        user_id: userId,
        action: "run_analysis",
      });

      // Storage objects — one per bucket
      const tinyPng = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
      ]);
      for (const bucket of BUCKETS) {
        await admin.storage
          .from(bucket)
          .upload(`${userId}/seed.png`, tinyPng, { contentType: "image/png" });
      }

      // ── 3. Invoke delete-my-data as the user ─────────────────────────────
      // Sign in to get a user JWT (service role can't be used — the function
      // reads auth.uid() from the JWT).
      const userClient = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
        auth: { persistSession: false },
      });
      const { data: session, error: signInErr } =
        await userClient.auth.signInWithPassword({ email, password });
      expect(signInErr, `signIn: ${signInErr?.message}`).toBeNull();

      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-my-data`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session!.session!.access_token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(res.ok, `delete-my-data HTTP ${res.status}: ${await res.text()}`).toBe(true);

      // ── 4. Assert zero survivors ─────────────────────────────────────────
      for (const table of USER_ID_TABLES) {
        const { count } = await admin
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId);
        expect(count ?? 0, `${table} has ${count} residual rows`).toBe(0);
      }

      for (const table of OWNER_TABLES) {
        const { count } = await admin
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("owner_user_id", userId);
        expect(count ?? 0, `${table} has ${count} residual rows`).toBe(0);
      }

      // person-scoped residuals — if persons were deleted, these must also
      // be gone; checking via the originally-seeded person id catches any
      // orphan rows that somehow survived the person cascade.
      for (const table of PERSON_TABLES) {
        const { count } = await admin
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("person_id", selfPerson!.id);
        expect(count ?? 0, `${table} residual for deleted person`).toBe(0);
      }

      // profile
      const { count: profileCount } = await admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("id", userId);
      expect(profileCount ?? 0, "profile row survived").toBe(0);

      // auth.users
      const { data: usersAfter } = await admin.auth.admin.listUsers();
      const survived = usersAfter?.users?.some((u) => u.id === userId);
      expect(survived, "auth user survived").toBe(false);

      // Storage buckets — list prefix for the user, should be empty
      for (const bucket of BUCKETS) {
        const { data: entries } = await admin.storage
          .from(bucket)
          .list(userId);
        expect(
          entries?.length ?? 0,
          `${bucket} still has objects under ${userId}/`,
        ).toBe(0);
      }
    } catch (err) {
      // Best-effort cleanup on assertion failure so we don't leak test users
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw err;
    }
  }, 60_000);
});
