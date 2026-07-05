// ── Tracker lookup helpers (client-safe) ────────────────────────────────────
// Turns the /api/tracker response into per-direction lookup maps keyed by
// scheduled departure time, plus the platform-label formatter shared by the
// train cards and the platform map sheet.

import type { Direction } from '@/lib/schedule-data';
import type { TrackerTrip } from '@/app/api/tracker/route';

export interface TrackerInfo {
  platform: string;
  expected: string;
  delay: number;
  cancelled: boolean;
  arriveIn: string;
}

/**
 * Build lookup maps from tracker trips (source: railsix.com).
 * Both directions key by scheduledTime = departure from origin station:
 *  inbound  (SB) scheduledTime = departure from Unionville → match trip.departure
 *  outbound (NB) scheduledTime = departure from Union      → match trip.departure
 */
export function buildTrackerMaps(trips: TrackerTrip[]): {
  inbound: Map<string, TrackerInfo>;
  outbound: Map<string, TrackerInfo>;
} {
  const inbound = new Map<string, TrackerInfo>();
  const outbound = new Map<string, TrackerInfo>();
  for (const t of trips) {
    const info: TrackerInfo = {
      platform: t.platform,
      expected: t.expected,
      delay: t.delay,
      cancelled: t.cancelled,
      arriveIn: t.arriveIn,
    };
    if (t.directionCd === 'Inbound') {
      inbound.set(t.scheduledTime, info);
    } else {
      outbound.set(t.scheduledTime, info);
    }
  }
  return { inbound, outbound };
}

export function getTrackerInfo(
  trip: { departure: string; arrival: string },
  direction: Direction,
  inbound: Map<string, TrackerInfo>,
  outbound: Map<string, TrackerInfo>
): TrackerInfo | null {
  // railsix.com: scheduledTime = departure from origin for both directions
  if (direction === 'homeToOffice') return inbound.get(trip.departure) ?? null;
  return outbound.get(trip.departure) ?? null;
}

/** "7 & 8" / "7,8" / "7/8" → "7 | 8" — Metrolinx's own separator is "&" (see types.ts). */
export function formatPlatformLabel(platform: string): string {
  return platform.split(/[,/&]/).map((p) => p.trim()).filter(Boolean).join(' | ');
}
