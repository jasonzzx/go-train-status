// ── Shared, server-side platform memory (Vercel KV / Upstash Redis) ─────────
//
// GO only publishes a Union departure's platform while the train is standing at
// Union (~10-15 min before departure) and wipes it from EVERY API endpoint the
// instant it leaves. So a train that's already departed ("NOW" / running) has no
// platform anywhere — verified against the live API. The only way to show it is
// to capture it during the boarding window and remember it.
//
// localStorage does that per-browser; this does it server-side so the platform
// is available to ANY device and a cold open after departure. A cron polls
// UnionDepartures and writes here (see /api/cron/platforms); /api/tracker reads
// here to backfill departed trains.
//
// Backed by the REST API of the Redis store Vercel provisions for KV (env vars
// KV_REST_API_URL / KV_REST_API_TOKEN, with UPSTASH_* as fallbacks). If those
// aren't set, every call safely no-ops so the app still runs (falling back to
// the client's localStorage), and nothing breaks before the store is created.

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

// Self-housekeeping: each service day is one Redis key (`goplat:<date>`) and
// the app only ever reads the CURRENT one. Past days are kept for a week so
// display issues can be traced back to what the feed actually published (the
// live API keeps no history). Every write refreshes the TTL, so a day's key
// auto-deletes ~7 days after its last write. At most ~8 tiny keys (~5KB each)
// exist at once; nothing accumulates and there's no cleanup job to run.
const TTL_SECONDS = 7 * 24 * 60 * 60;

// Short in-memory cache so the 30s client poll (and concurrent users) collapse
// onto one DB read per window instead of hammering the store on every request.
const READ_CACHE_MS = 20_000;
let readCache: { serviceDay: string; at: number; value: Record<string, string> } | null = null;

/** True when a KV/Redis store is wired up; otherwise all ops no-op. */
export function platformStoreEnabled(): boolean {
  return Boolean(REST_URL && REST_TOKEN);
}

/** Service day (YYYY-MM-DD, America/Toronto) used as the storage key. */
export function torontoDateStr(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function keyFor(serviceDay: string): string {
  return `goplat:${serviceDay}`;
}

/** Run one Redis command via the Upstash REST API. Throws on transport error. */
async function redis(command: (string | number)[]): Promise<unknown> {
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

/**
 * Save the given `tripNumber → platform` pairs for a service day, merging into
 * any already stored. Best-effort: returns the number written, 0 if disabled.
 */
export async function savePlatforms(
  serviceDay: string,
  platforms: Record<string, string>
): Promise<number> {
  if (!platformStoreEnabled()) return 0;
  const entries = Object.entries(platforms).filter(([num, plat]) => num && plat);
  if (entries.length === 0) return 0;

  const key = keyFor(serviceDay);
  // HSET key f1 v1 f2 v2 ... (single command), then refresh the TTL.
  const hset: (string | number)[] = ['HSET', key];
  for (const [num, plat] of entries) hset.push(num, plat);
  await redis(hset);
  await redis(['EXPIRE', key, TTL_SECONDS]);
  return entries.length;
}

/**
 * Read all stored `tripNumber → platform` pairs for a service day.
 * Returns {} if the store is disabled or empty (never throws to the caller).
 */
export async function getStoredPlatforms(serviceDay: string): Promise<Record<string, string>> {
  if (!platformStoreEnabled()) return {};
  const now = Date.now();
  if (readCache && readCache.serviceDay === serviceDay && now - readCache.at < READ_CACHE_MS) {
    return readCache.value;
  }
  try {
    const flat = (await redis(['HGETALL', keyFor(serviceDay)])) as string[] | null;
    const out: Record<string, string> = {};
    if (Array.isArray(flat)) {
      for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = flat[i + 1];
    }
    readCache = { serviceDay, at: now, value: out };
    return out;
  } catch {
    return {};
  }
}
