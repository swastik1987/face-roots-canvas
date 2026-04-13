/** CORS headers for all Edge Functions. */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Respond to CORS pre-flight requests. */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

/** Merge CORS headers into a JSON response. */
export function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Extract the authenticated user from the Authorization header. */
import { createClient } from 'npm:@supabase/supabase-js@2';

export async function requireAuth(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Missing Authorization header');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );

  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (error || !user) throw new Error('Unauthorized');
  return user;
}
