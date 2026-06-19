// ── Schedule logic ────────────────────────────────────────
// Line-agnostic trip + stop-sequence logic. All line/station data comes from
// the line registry (lines.ts), which loads per-line GTFS-derived JSON.
//
// "Office" is always Union Station — every GO rail line radiates from it, so
// homeToOffice = toward Union, officeToHome = away from Union.

import {
  getLine,
  getLineSchedule,
  UNION_CODE,
  type GtfsTrip,
  type StationInfo,
} from '@/lib/lines';

export type { StationInfo } from '@/lib/lines';

// ── Trip types ────────────────────────────────────────────

export interface Trip {
  departure: string;              // "HH:MM" from origin (home SB, Union NB)
  arrival: string;                // "HH:MM" at destination (Union SB, home NB)
  tripTime: string;               // "N min"
  vehicleType: 'train' | 'bus';
  tripId: string;                 // GTFS trip_id
  stopTimes: Record<string, string>; // stationCode → "HH:MM" for all stops
}

export type ServiceType = 'weekday' | 'saturday' | 'sunday';
export type Direction = 'homeToOffice' | 'officeToHome';

// ── Per-line derived lookups (memoized) ───────────────────

interface LineLookups {
  toUnionOrder: string[];                  // outward → Union
  fromUnionOrder: string[];                // Union → outward
  stopNames: Record<string, string>;       // code → display name
  stopCodeMap: Record<string, string>;     // lowercased live name → code
}

const lookupCache = new Map<string, LineLookups>();

function getLookups(lineId: string): LineLookups {
  const cached = lookupCache.get(lineId);
  if (cached) return cached;

  const line = getLine(lineId);
  const toUnionOrder = line.stations.map((s) => s.code); // outward → Union
  const fromUnionOrder = [...toUnionOrder].reverse();

  const stopNames: Record<string, string> = {};
  const stopCodeMap: Record<string, string> = { union: UNION_CODE, 'union station': UNION_CODE };
  for (const s of line.stations) {
    stopNames[s.code] = s.name;
    stopCodeMap[s.shortName.toLowerCase()] = s.code;
    stopCodeMap[s.name.toLowerCase().replace(/ go$/, '').trim()] = s.code;
  }

  const lookups = { toUnionOrder, fromUnionOrder, stopNames, stopCodeMap };
  lookupCache.set(lineId, lookups);
  return lookups;
}

// ── Schedule lookup ───────────────────────────────────────

/**
 * Returns all trips for a station/direction/service type on a line, from the
 * GTFS schedule. Every station is treated equally — no hardcoded data.
 */
export function getScheduleForStation(
  lineId: string,
  direction: Direction,
  serviceType: ServiceType,
  stationCode: string,
): Trip[] {
  const sched = getLineSchedule(lineId);
  const dayTrips: GtfsTrip[] =
    direction === 'homeToOffice' ? sched[serviceType].toUnion : sched[serviceType].fromUnion;

  return dayTrips
    .filter((t) => stationCode in t.stopTimes && UNION_CODE in t.stopTimes)
    .map((t) => {
      const departure =
        direction === 'homeToOffice' ? t.stopTimes[stationCode] : t.stopTimes[UNION_CODE];
      const arrival =
        direction === 'homeToOffice' ? t.stopTimes[UNION_CODE] : t.stopTimes[stationCode];
      const diff = (timeToMinutes(arrival) - timeToMinutes(departure) + 1440) % 1440;
      return {
        departure,
        arrival,
        tripTime: `${diff} min`,
        vehicleType: t.vehicleType,
        tripId: t.tripId,
        stopTimes: t.stopTimes,
      };
    });
}

// ── Stop sequence ─────────────────────────────────────────

export interface StationStop {
  name: string;
  code: string;
  scheduledTime: string;    // "HH:MM"
  scheduledMinutes: number; // absolute minutes from midnight
}

/**
 * Returns the ordered stop sequence for a trip using exact GTFS stop times.
 * Works for any station on any line.
 */
export function getStops(
  lineId: string,
  trip: Trip,
  direction: Direction,
  homeCode: string,
  liveStops?: string[],
): StationStop[] {
  const { toUnionOrder, fromUnionOrder, stopNames, stopCodeMap } = getLookups(lineId);
  const order = direction === 'homeToOffice' ? toUnionOrder : fromUnionOrder;
  const stopTimes = trip.stopTimes;

  // Stops this trip actually serves, in correct order
  const tripStopCodes = order.filter((code) => code in stopTimes);

  // homeToOffice: home → Union. officeToHome: Union → home.
  const homeIdx = tripStopCodes.indexOf(homeCode);
  let relevantCodes: string[];
  if (direction === 'homeToOffice') {
    relevantCodes = homeIdx >= 0 ? tripStopCodes.slice(homeIdx) : tripStopCodes;
  } else {
    relevantCodes = homeIdx >= 0 ? tripStopCodes.slice(0, homeIdx + 1) : tripStopCodes;
  }

  if (liveStops && liveStops.length > 0) {
    return applyLiveStops(relevantCodes, stopTimes, liveStops, direction, stopNames, stopCodeMap);
  }

  return relevantCodes.map((code) => {
    const time = stopTimes[code];
    return { name: stopNames[code] ?? code, code, scheduledTime: time, scheduledMinutes: timeToMinutes(time) };
  });
}

/**
 * Merges railsix live stop names into the computed stop sequence, using GTFS
 * times for any stop we recognize.
 */
function applyLiveStops(
  staticCodes: string[],
  stopTimes: Record<string, string>,
  liveStops: string[],
  direction: Direction,
  stopNames: Record<string, string>,
  stopCodeMap: Record<string, string>,
): StationStop[] {
  const origin = staticCodes[0];
  const dest = staticCodes[staticCodes.length - 1];
  const destName = (stopNames[dest] ?? dest).toLowerCase().replace(/ go$/, '').trim();

  const destIdx = liveStops.findIndex(
    (s) => s.toLowerCase().replace(/ go$/, '').trim() === destName || s.toLowerCase().includes(destName),
  );
  const relevant = destIdx >= 0 ? liveStops.slice(0, destIdx + 1) : liveStops;
  const toCode = (s: string) => stopCodeMap[s.toLowerCase().replace(/ go$/, '').trim()] ?? s;

  const merged: string[] =
    direction === 'homeToOffice'
      ? [origin, ...relevant.map(toCode)]
      : [...relevant.map(toCode), dest];

  const seen = new Set<string>();
  const deduped = merged.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));

  return deduped.map((code) => {
    const time = stopTimes[code] ?? '';
    return {
      name: stopNames[code] ?? code,
      code,
      scheduledTime: time,
      scheduledMinutes: time ? timeToMinutes(time) : 0,
    };
  });
}

// ── Helpers ───────────────────────────────────────────────

export function getServiceType(date: Date): ServiceType {
  const day = date.getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
}

/** Convert "HH:MM" to total minutes from midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
