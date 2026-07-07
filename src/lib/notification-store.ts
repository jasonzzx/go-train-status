// ── Server-side push-watch store (Vercel KV / Upstash Redis) ────────────────
// One Redis hash per service day (`gonotif:<date>`): each field is one
// "watch" — a push subscription paired with the single trip it wants
// notifications for, plus the sent-state that keeps /api/cron/notify from
// re-sending the same event every run.
//
//   field  = sha256(endpoint)[:16] + ":" + tripNumber
//   value  = JSON TripWatch
//
// Watches are inherently per-day (you watch *today's* 17:40), so the whole
// key auto-expires ~30h after its last write — no cleanup job needed. The
// cron additionally HDELs watches whose train departed long ago and
// subscriptions push reports as gone.
//
// Backed by src/lib/kv.ts; every call no-ops safely when KV isn't configured.

import { createHash } from 'node:crypto';
import { kvEnabled, kvCommand as redis } from '@/lib/kv';
import type { WatchSentState } from '@/lib/notify-rules';

const TTL_SECONDS = 30 * 60 * 60;

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface TripWatch {
  sub: PushSubscriptionJSON;
  tripNumber: string;
  lineId: string;
  directionCd: 'Inbound' | 'Outbound';
  /** Scheduled departure "HH:MM" (for message text + expiry). */
  departure: string;
  /** Localized destination label captured at watch time (e.g. "Unionville"). */
  dest: string;
  lang: 'en' | 'zh';
  sent: WatchSentState;
}

export function notificationStoreEnabled(): boolean {
  return kvEnabled();
}

function keyFor(serviceDay: string): string {
  return `gonotif:${serviceDay}`;
}

/** Stable hash field for a (subscription, trip) pair — endpoint URLs are long
    and contain characters we'd rather not use as hash-field names. */
export function watchField(endpoint: string, tripNumber: string): string {
  const h = createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
  return `${h}:${tripNumber}`;
}

/** Parse an HGETALL flat reply ([f1, v1, f2, v2, …]) into watches, skipping
    anything that doesn't decode — one corrupt field must not kill the cron. */
export function parseWatchEntries(flat: unknown): Array<{ field: string; watch: TripWatch }> {
  if (!Array.isArray(flat)) return [];
  const out: Array<{ field: string; watch: TripWatch }> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const field = flat[i];
    const raw = flat[i + 1];
    if (typeof field !== 'string' || typeof raw !== 'string') continue;
    try {
      const watch = JSON.parse(raw) as TripWatch;
      if (watch?.sub?.endpoint && watch.tripNumber) out.push({ field, watch });
    } catch {
      // skip corrupt entry
    }
  }
  return out;
}

/** Create or replace a watch. Returns false when the store is disabled. */
export async function saveWatch(serviceDay: string, watch: TripWatch): Promise<boolean> {
  if (!notificationStoreEnabled()) return false;
  const key = keyFor(serviceDay);
  await redis(['HSET', key, watchField(watch.sub.endpoint, watch.tripNumber), JSON.stringify(watch)]);
  await redis(['EXPIRE', key, TTL_SECONDS]);
  return true;
}

/** Persist updated sent-state for existing watches (cron bookkeeping). */
export async function updateWatches(
  serviceDay: string,
  updates: Array<{ field: string; watch: TripWatch }>,
): Promise<void> {
  if (!notificationStoreEnabled() || updates.length === 0) return;
  const hset: (string | number)[] = ['HSET', keyFor(serviceDay)];
  for (const { field, watch } of updates) hset.push(field, JSON.stringify(watch));
  await redis(hset);
}

/** Remove a watch by its (endpoint, trip) identity — user toggled the bell off. */
export async function deleteWatch(
  serviceDay: string,
  endpoint: string,
  tripNumber: string,
): Promise<void> {
  if (!notificationStoreEnabled()) return;
  await redis(['HDEL', keyFor(serviceDay), watchField(endpoint, tripNumber)]);
}

/** Remove watches by stored field name (expired trips, dead subscriptions). */
export async function deleteWatchFields(serviceDay: string, fields: string[]): Promise<void> {
  if (!notificationStoreEnabled() || fields.length === 0) return;
  await redis(['HDEL', keyFor(serviceDay), ...fields]);
}

/** All watches for a service day. Returns [] when disabled or on any error. */
export async function listWatches(
  serviceDay: string,
): Promise<Array<{ field: string; watch: TripWatch }>> {
  if (!notificationStoreEnabled()) return [];
  try {
    return parseWatchEntries(await redis(['HGETALL', keyFor(serviceDay)]));
  } catch {
    return [];
  }
}
