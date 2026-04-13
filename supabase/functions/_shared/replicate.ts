/**
 * Minimal Replicate API client for Deno Edge Functions.
 * Supports running a model and polling until completion.
 */

const REPLICATE_API = 'https://api.replicate.com/v1';

interface ReplicateInput {
  [key: string]: unknown;
}

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string;
}

function authHeaders() {
  return {
    'Authorization': `Bearer ${Deno.env.get('REPLICATE_API_TOKEN')}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Run a Replicate model and wait for the output.
 * @param model  Full model version string, e.g. "owner/model:sha"
 * @param input  Model input payload
 * @param timeoutMs  Max wait in ms (default 90s)
 */
export async function replicateRun(
  model: string,
  input: ReplicateInput,
  timeoutMs = 90_000,
): Promise<unknown> {
  // Create prediction
  const createRes = await fetch(`${REPLICATE_API}/predictions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ version: model, input }),
  });
  if (!createRes.ok) {
    throw new Error(`Replicate create failed: ${await createRes.text()}`);
  }
  const prediction: Prediction = await createRes.json();

  // Poll until done or timeout
  const deadline = Date.now() + timeoutMs;
  let delay = 500;

  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(delay * 1.5, 5_000);

    const pollRes = await fetch(`${REPLICATE_API}/predictions/${prediction.id}`, {
      headers: authHeaders(),
    });
    if (!pollRes.ok) continue;

    const p: Prediction = await pollRes.json();

    if (p.status === 'succeeded') return p.output;
    if (p.status === 'failed' || p.status === 'canceled') {
      throw new Error(`Replicate prediction ${p.status}: ${p.error ?? 'unknown error'}`);
    }
  }

  throw new Error(`Replicate prediction timed out after ${timeoutMs}ms`);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
