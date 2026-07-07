// ── Shared Upstash/Vercel-KV REST access ────────────────────────────────────
// One tiny transport used by every server-side store (platform-store,
// notification-store). Backed by the REST API of the Redis store Vercel
// provisions for KV (env vars KV_REST_API_URL / KV_REST_API_TOKEN, with
// UPSTASH_* as fallbacks). If those aren't set, callers no-op safely.

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

/** True when a KV/Redis store is wired up; otherwise all ops should no-op. */
export function kvEnabled(): boolean {
  return Boolean(REST_URL && REST_TOKEN);
}

/** Run one Redis command via the Upstash REST API. Throws on transport error. */
export async function kvCommand(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`KV REST HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`KV error: ${json.error}`);
  return json.result;
}
