/**
 * Service-role Supabase client for Edge Functions.
 * Use this for privileged DB operations (e.g. writing embeddings).
 * Never expose the service role key to the client.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

let _admin: ReturnType<typeof createClient> | null = null;

export function getAdminClient() {
  if (_admin) return _admin;
  _admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return _admin;
}
