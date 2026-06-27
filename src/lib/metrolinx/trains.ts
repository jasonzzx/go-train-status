// ── Live train wrappers (ServiceataGlance / UnionDepartures / Exceptions) ──
// Typed access to the live-train endpoints, keyed by trip number for joining
// against our GTFS schedule. Cached briefly so the 30s client poll and
// concurrent users collapse onto one upstream call.
//
// UNVERIFIED mapping — field names come from the go_transit_ruby wrapper, not a
// live payload. See docs/api-migration-plan.md.

import { fetchJson, listFrom } from './client';
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
  return listFrom<RawUnionDeparture>(data, 'Trips', 'Trip');
}

/** Cancelled / modified train trips. */
export async function getTrainExceptions(): Promise<RawExceptionTrain[]> {
  const data = await fetchJson<unknown>('ServiceUpdate/Exceptions/Train', EXCEPTIONS_TTL_MS);
  return listFrom<RawExceptionTrain>(data, 'Trips', 'Trip');
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

function toInt(value: string | undefined): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : 0;
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
    if (t.LineCode !== lineCode) continue;
    const num = t.TripNumber;
    if (!num) continue;
    const s = ensure(num);
    const delaySec = toInt(t.DelaySeconds);
    s.delayMin = delaySec > 0 ? Math.round(delaySec / 60) : 0;
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

export { tripNumberFromId };
