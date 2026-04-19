import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
// Lovable uses VITE_SUPABASE_PUBLISHABLE_KEY; fall back to VITE_SUPABASE_ANON_KEY for local dev
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[FaceBlame] Supabase env vars missing. Auth and DB calls will fail.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

// ── Convenience type aliases ──────────────────────────────────────────────────

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  locale: string;
  plan: 'free' | 'pro';
  age_attested_18_plus: boolean;
  age_attested_at: string | null;
  created_at: string;
};

export type Person = {
  id: string;
  owner_user_id: string;
  display_name: string;
  relationship_tag: string;
  generation: number;
  is_self: boolean;
  birth_year_approx: number | null;
  created_at: string;
};

export type ConsentEvent = {
  id: string;
  user_id: string;
  event_type: 'granted' | 'revoked' | 'updated';
  scopes: { embeddings: boolean; raw_images: boolean; sharing: boolean };
  policy_version: string;
  user_agent: string | null;
  ip_hash: string | null;
  created_at: string;
};

export type Analysis = {
  id: string;
  user_id: string;
  self_person_id: string;
  status: 'pending' | 'embedding' | 'matching' | 'narrating' | 'rendering' | 'done' | 'failed';
  error_message: string | null;
  model_versions: { face: string; features: string; llm: string } | null;
  card_storage_path: string | null;
  is_stale: boolean;
  started_at: string;
  completed_at: string | null;
};

// Current policy version — bump when T&Cs change
export const POLICY_VERSION = 'v1.0.0';
