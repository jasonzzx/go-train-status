// ── Official Metrolinx Open Data API client ───────────────────────────────
// Single entry point for every call to api.openmetrolinx.com. Provides:
//   • API key injection from the METROLINX_API_KEY env var (never hardcode)
//   • a feature flag (METROLINX_API_ENABLED) so routes can fall back to the
//     legacy scrapers until the official feed is verified against real payloads
//   • a token-bucket rate limiter (API hard limit is 300 calls/sec; 429s or
//     excessive bad calls risk key suspension) as a guard against runaway loops
//   • a tiny in-memory TTL cache + in-flight de-dupe so concurrent users (and
//     the 30s client poll) collapse onto a single upstream request per window
//
// Wire format notes (confirmed via the go_transit_ruby wrapper, NOT yet against
// a live payload — see docs/api-migration-plan.md):
//   • Every URL is `${BASE}/${path}?key=KEY`; responses are JSON by default.
//   • The JSON mirrors the XML shape: lists are nested as
//       { "<Plural>": { "<Singular>": [ {...}, {...} ] } }
//     and a single element may serialize as an object instead of a 1-element
//     array — `toArray` / `listFrom` normalize both.
//   • Field keys are PascalCase (e.g. TripNumber, LineCode, DelaySeconds).

const BASE = 'https://api.openmetrolinx.com/OpenDataAPI/api/V1';

/** Calls/sec hard limit published by Metrolinx. */
const RATE_LIMIT_PER_SEC = 300;

// ── Feature flag + key ─────────────────────────────────────────────────────

/** True only when the official feed is explicitly enabled AND a key is set. */
export function metrolinxEnabled(): boolean {
  const flag = process.env.METROLINX_API_ENABLED;
  return (flag === '1' || flag === 'true') && Boolean(process.env.METROLINX_API_KEY);
}

function apiKey(): string {
  const key = process.env.METROLINX_API_KEY;
  if (!key) throw new Error('METROLINX_API_KEY is not set');
  return key;
}

// ── Token-bucket rate limiter (per server instance) ────────────────────────

let tokens = RATE_LIMIT_PER_SEC;
let lastRefill = Date.now();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireToken(): Promise<void> {
  // Refill based on elapsed time, then spend one token (waiting if empty).
  for (;;) {
    const now = Date.now();
    tokens = Math.min(RATE_LIMIT_PER_SEC, tokens + ((now - lastRefill) / 1000) * RATE_LIMIT_PER_SEC);
    lastRefill = now;
    if (tokens >= 1) {
      tokens -= 1;
      return;
    }
    await sleep(((1 - tokens) / RATE_LIMIT_PER_SEC) * 1000);
  }
}

// ── TTL cache + in-flight de-dupe ──────────────────────────────────────────

interface CacheEntry {
  expires: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * GET a JSON endpoint. `path` is relative to the V1 base (e.g.
 * "ServiceataGlance/Trains/All"). Results are cached for `ttlMs` and concurrent
 * callers share a single upstream request. Throws on network/HTTP errors so the
 * caller can decide whether to fall back.
 */
export async function fetchJson<T>(path: string, ttlMs = 0): Promise<T> {
  const now = Date.now();

  const cached = cache.get(path);
  if (cached && cached.expires > now) return cached.value as T;

  const pending = inFlight.get(path);
  if (pending) return pending as Promise<T>;

  const request = (async (): Promise<T> => {
    await acquireToken();
    const url = `${BASE}/${path}?key=${encodeURIComponent(apiKey())}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Metrolinx API HTTP ${res.status} for ${path}`);
    const data = (await res.json()) as T;
    if (ttlMs > 0) cache.set(path, { expires: Date.now() + ttlMs, value: data });
    return data;
  })().finally(() => {
    inFlight.delete(path);
  });

  inFlight.set(path, request);
  return request;
}

// ── Envelope helpers ───────────────────────────────────────────────────────

/** Normalize a value that may be an array, a single object, or null/undefined. */
export function toArray<T>(node: unknown): T[] {
  if (Array.isArray(node)) return node as T[];
  if (node === null || node === undefined) return [];
  return [node as T];
}

/**
 * Pull a list out of the `{ Plural: { Singular: [...] } }` envelope the API
 * uses, tolerating the single-element-as-object case.
 */
export function listFrom<T>(root: unknown, plural: string, singular: string): T[] {
  const container = (root as Record<string, unknown> | null | undefined)?.[plural];
  if (!container || typeof container !== 'object') return [];
  return toArray<T>((container as Record<string, unknown>)[singular]);
}
