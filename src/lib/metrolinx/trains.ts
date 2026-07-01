// ── Live train wrappers (ServiceataGlance / UnionDepartures / Exceptions) ──
// Typed access to the live-train endpoints, keyed by trip number for joining
// against our GTFS schedule. Cached briefly so the 30s client poll and
// concurrent users collapse onto one upstream call.
//
// Mapping VERIFIED against live payloads (2026-06). See docs/api-migration-plan.md.

import { fetchJson, listFrom, toArray, metrolinxLineCode } from './client';
import type { RawLiveTrain, RawUnionDeparture, RawExceptionTrain } from './types';

// ServiceataGlance covers currently-live trips and refreshes ~every minute;
// 20s keeps it fresh for the 30s poll while collapsing concurrent callers.
const LIVE_TTL_MS = 20_000;
const EXCEPTIONS_TTL_MS = 30_000;

/** Live (in-service) trains across the whole network. */
export async function getLiveTrains(): Promise<RawLiveTrain[]> {
  const data = await fetchJson<unknown>('ServiceataGlance/Trains/All', LIVE_TTL_MS);
  return listFrom<RawLiveTrain>(data, 'Trips', 'Trip');
}

/** Upcoming Union departures (platform is only populated ~10–15 min ahead). */
export async function getUnionDepartures(): Promise<RawUnionDeparture[]> {
  const data = await fetchJson<unknown>('ServiceUpdate/UnionDepartures/All', LIVE_TTL_MS);
  // Envelope is { AllDepartures: { Trip: [...] } } (not the usual Trips wrapper).
  return listFrom<RawUnionDeparture>(data, 'AllDepartures', 'Trip');
}

/** Cancelled / modified train trips. */
export async function getTrainExceptions(): Promise<RawExceptionTrain[]> {
  const data = await fetchJson<unknown>('ServiceUpdate/Exceptions/Train', EXCEPTIONS_TTL_MS);
  // Envelope puts Trip at the top level: { Metadata, Trip: [...] }.
  return toArray<RawExceptionTrain>((data as Record<string, unknown> | null)?.Trip);
}

// ── Derived, normalized live status keyed by trip number ───────────────────

export interface LiveTrainStatus {
  /** Delay in minutes, ≥ 0 (positive = late). */
  delayMin: number;
  cancelled: boolean;
  /** Boarding platform if known (Union departures only), else "". */
  platform: string;
  /** Number of cars, or "". */
  cars: string;
  /** True if any live signal exists for this trip (live, platform, or exception). */
  hasLive: boolean;
}

function tripNumberFromId(tripId: string): string {
  // GTFS trip_id "20260616-ST-7127" → trip number "7127".
  return tripId.split('-').pop() ?? '';
}

function toInt(value: string | number | undefined): number {
  const n = typeof value === 'number' ? value : parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

/** Minutes-since-midnight, America/Toronto (0–1439). */
function torontoMinutesNow(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

function hhmmToMinutes(s: string | undefined): number | null {
  if (!s || !s.includes(':')) return null;
  const [h, m] = s.split(':');
  const v = Number(h) * 60 + Number(m);
  return Number.isFinite(v) ? v : null;
}

/**
 * Has this trip actually entered service (left its origin)?
 *
 * The live feed lists a train BEFORE it departs (the trainset is pre-positioned
 * at its origin). For such a train, ServiceataGlance's `DelaySeconds` is NOT a
 * real deviation — it's `now − StartTime`, a countdown to departure that can be
 * tens of minutes in magnitude (verified live: −54 min, −40 min, …). Treating it
 * as a delay produces a bogus "+N min" once that countdown crosses zero. So we
 * only trust `DelaySeconds` after the trip's scheduled start.
 */
function tripHasStarted(startTime: string | undefined): boolean {
  const start = hhmmToMinutes(startTime);
  if (start === null) return true; // no StartTime → don't suppress a real signal
  const now = torontoMinutesNow();
  if (now >= start) return true;
  // Past-midnight wrap (e.g. start 23:50, now 00:10): still consider it started.
  if (start - now > 720) return true;
  return false;
}

/**
 * Fetch all live signals and build a `tripNumber → LiveTrainStatus` map for the
 * given line. Pulls ServiceataGlance (delays), UnionDepartures (outbound
 * platform) and Exceptions (cancellations) in parallel.
 */
export async function getLiveStatusByTripNumber(
  lineCode: string,
): Promise<Map<string, LiveTrainStatus>> {
  const [live, union, exceptions] = await Promise.all([
    getLiveTrains(),
    getUnionDepartures(),
    getTrainExceptions(),
  ]);

  const apiCode = metrolinxLineCode(lineCode);
  const map = new Map<string, LiveTrainStatus>();
  const ensure = (tripNumber: string): LiveTrainStatus => {
    let s = map.get(tripNumber);
    if (!s) {
      s = { delayMin: 0, cancelled: false, platform: '', cars: '', hasLive: false };
      map.set(tripNumber, s);
    }
    return s;
  };

  for (const t of live) {
    if (t.LineCode !== apiCode) continue;
    const num = t.TripNumber;
    if (!num) continue;
    const s = ensure(num);
    // Only trust DelaySeconds once the trip has left its origin — before that
    // it's a countdown to departure, not a delay (see tripHasStarted).
    const delaySec = toInt(t.DelaySeconds);
    s.delayMin = delaySec > 0 && tripHasStarted(t.StartTime) ? Math.round(delaySec / 60) : 0;
    s.cars = t.Cars ?? '';
    s.hasLive = true;
  }

  for (const t of union) {
    const num = t.TripNumber;
    if (!num) continue;
    const platform = t.Platform && t.Platform !== '-' ? t.Platform : '';
    if (!platform) continue;
    const s = ensure(num);
    s.platform = platform;
    s.hasLive = true;
  }

  for (const t of exceptions) {
    const num = t.TripNumber;
    if (!num) continue;
    if (toInt(t.IsCancelled) <= 0) continue;
    const s = ensure(num);
    s.cancelled = true;
    s.hasLive = true;
  }

  return map;
}

// ── Per-trip scheduled platform (Schedule/Trip) ──────────────────────────

interface ScheduleTripStop {
  Code?: string;
  Track?: { Scheduled?: string; Actual?: string | null };
}

const SCHEDULE_TRIP_TTL_MS = 120_000;

function torontoDateCompact(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replace(/-/g, '');
}

/**
 * Look up the scheduled platform for a specific stop on a trip via
 * Schedule/Trip/{date}/{tripNumber}. Returns "" on any failure or if
 * the stop/platform isn't found. Results are cached for 2 min since
 * scheduled platforms rarely change intraday.
 */
export async function getScheduledPlatform(
  tripNumber: string,
  stopCode: string,
): Promise<string> {
  try {
    const data = await fetchJson<Record<string, unknown>>(
      `Schedule/Trip/${torontoDateCompact()}/${tripNumber}`,
      SCHEDULE_TRIP_TTL_MS,
    );
    const trips = toArray<{ Stops?: unknown }>(data?.Trips);
    if (!trips.length) return '';
    const stops = toArray<ScheduleTripStop>(trips[0].Stops);
    const stop = stops.find((s) => s.Code === stopCode);
    if (!stop?.Track) return '';
    const actual = stop.Track.Actual;
    return (actual != null ? actual : '') || stop.Track.Scheduled || '';
  } catch {
    return '';
  }
}

export { tripNumberFromId };
