/**
 * Storage helpers with timeout protection.
 *
 * Supabase's `createSignedUrl` has no built-in timeout — a network stall
 * can hang a UI flow indefinitely. Wrap it in Promise.race with a hard
 * cap so callers can fail fast and show an error instead of spinning.
 */
import { supabase } from "@/lib/supabase";

const DEFAULT_SIGNED_URL_TIMEOUT_MS = 30_000;

type SignedUrlResult = {
  data: { signedUrl: string } | null;
  error: Error | null;
};

/** Create a signed URL with a hard timeout. */
export async function createSignedUrlSafe(
  bucket: string,
  path: string,
  expiresInSecs: number,
  timeoutMs: number = DEFAULT_SIGNED_URL_TIMEOUT_MS,
): Promise<SignedUrlResult> {
  const call = supabase.storage.from(bucket).createSignedUrl(path, expiresInSecs);

  const timeout = new Promise<SignedUrlResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          data: null,
          error: new Error(`createSignedUrl timed out after ${timeoutMs}ms (bucket=${bucket})`),
        }),
      timeoutMs,
    ),
  );

  const result = (await Promise.race([call, timeout])) as SignedUrlResult;
  return result;
}
