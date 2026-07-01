// ── Live day schedule (Schedule/Line) ──────────────────────────────────────
// The static GTFS extraction bakes ONE representative weekday/saturday/sunday
// per line, so it can't know about holidays (e.g. Canada Day runs weekend
// service under different trip numbers) or mid-feed service changes.
// Schedule/Line/{date}/{code}/{dir} returns the actual schedule for a specific
// date, so it is the primary schedule source; the static GTFS JSON stays as
// the fallback base layer when the API is unreachable.
//
// Mapping VERIFIED against live payloads (2026-07): train stops carry station
// codes (UN, MJ, …) while bus stops carry numeric GTFS stop_ids (mapped via
// the same stop map the GTFS generator uses); after-midnight stops carry the
// next calendar date (converted here to the GTFS 24:xx convention); a date
// with no service answers ErrorCode "204" with Lines: null.

import { fetchJson, toArray, metrolinxLineCode } from './client';
import type { GtfsTrip } from '@/lib/lines';

// A given date's schedule is effectively static intraday.
const DAY_SCHEDULE_TTL_MS = 10 * 60_000;

/** Direction letters accepted by Schedule/Line for each line. */
const LINE_DIRECTIONS: Record<string, [string, string]> = {
  ST: ['S', 'N'],
  BR: ['S', 'N'],
  RH: ['S', 'N'],
  LW: ['E', 'W'],
  LE: ['E', 'W'],
  KI: ['E', 'W'],
  MI: ['E', 'W'],
};

// Parallel bus service merged into a line's day schedule. `stopMap` maps the
// bus GTFS stop_id → station code. Keep in sync with the master copy in
// scripts/line-gtfs-config.mjs.
const BUS_CONFIG: Record<string, { routes: string[]; stopMap: Record<string, string> }> = {
  ST: {
    routes: ['71'],
    stopMap: {
      '02300': 'UN', // Union Station Bus Terminal
      '00128': 'UI', // Unionville GO Bus
      '02141': 'UI', // Unionville GO Bus (secondary)
      '02144': 'UI', // YMCA Blvd @ Kennedy Rd (Unionville)
      '00124': 'CE', // Bullock Dr @ McCowan Rd (Centennial GO)
      '00125': 'CE', // Bullock Dr @ McCowan Rd (Centennial GO, NB)
      '00122': 'MR', // Main St N @ Station St (Markham GO)
      '00123': 'MR', // Main St N @ Ramona Blvd (Markham GO, NB)
      '00121': 'MJ', // Mount Joy GO Bus
      '02830': 'LI', // Old Elm GO Bus
      '08045': 'LI', // Old Elm GO Bus (NB)
    },
  },
};

interface RawScheduleStop {
  Code?: string;
  Order?: number | string;
  Time?: string; // "YYYY-MM-DD HH:MM:SS"
}
interface RawScheduleTrip {
  Number?: string;
  Stops?: unknown;
}
interface RawScheduleLine {
  Code?: string;
  Type?: string; // 'T' train | 'B' bus
  Trip?: unknown;
}
interface RawScheduleLineResponse {
  Metadata?: { ErrorCode?: string };
  Lines?: { Line?: unknown } | null;
}

export interface DaySchedule {
  toUnion: GtfsTrip[];
  fromUnion: GtfsTrip[];
}

const UNION = 'UN';

function dateUTC(yyyymmdd: string): number {
  return Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8));
}

/**
 * "YYYY-MM-DD HH:MM:SS" → "HH:MM" GTFS-style relative to `serviceDate`
 * (YYYYMMDD): a stop at 01:10 on the next calendar day becomes "25:10".
 */
function toGtfsTime(raw: string | undefined, serviceDate: string): string | null {
  if (!raw || raw.length < 16) return null;
  const datePart = raw.slice(0, 10).replace(/-/g, '');
  const hh = Number(raw.slice(11, 13));
  const mm = raw.slice(14, 16);
  if (!Number.isFinite(hh) || !/^\d{8}$/.test(datePart)) return null;
  const dayDiff =
    datePart === serviceDate ? 0 : Math.round((dateUTC(datePart) - dateUTC(serviceDate)) / 86_400_000);
  const h = hh + dayDiff * 24;
  if (h < 0 || h > 47) return null;
  return `${String(h).padStart(2, '0')}:${mm}`;
}

interface NormalizedTrip {
  tripNumber: string;
  vehicleType: 'train' | 'bus';
  /** Station codes in travel order (deduped). */
  orderedCodes: string[];
  /** stationCode → earliest "HH:MM" at that station. */
  stopTimes: Record<string, string>;
}

/**
 * Fetch one Schedule/Line page and normalize its trips. `stopMap` (buses)
 * translates raw stop ids to station codes; trains use their codes directly.
 * A "no service" answer (ErrorCode 204) yields []. Throws on transport errors.
 */
async function fetchLineTrips(
  routeCode: string,
  dir: string,
  serviceDate: string,
  stopMap?: Record<string, string>,
): Promise<NormalizedTrip[]> {
  const data = await fetchJson<RawScheduleLineResponse>(
    `Schedule/Line/${serviceDate}/${routeCode}/${dir}`,
    DAY_SCHEDULE_TTL_MS,
  );
  if (data?.Metadata?.ErrorCode !== '200') return [];

  const out: NormalizedTrip[] = [];
  for (const line of toArray<RawScheduleLine>(data.Lines?.Line)) {
    const vehicleType = line.Type === 'B' ? 'bus' : 'train';
    for (const trip of toArray<RawScheduleTrip>(line.Trip)) {
      const tripNumber = trip.Number ?? '';
      if (!tripNumber) continue;
      const stops = toArray<RawScheduleStop>(trip.Stops)
        .slice()
        .sort((a, b) => Number(a.Order ?? 0) - Number(b.Order ?? 0));

      const orderedCodes: string[] = [];
      const stopTimes: Record<string, string> = {};
      for (const s of stops) {
        const code = stopMap ? stopMap[s.Code ?? ''] : s.Code;
        if (!code) continue;
        const time = toGtfsTime(s.Time, serviceDate);
        if (!time) continue;
        if (!(code in stopTimes)) orderedCodes.push(code);
        // Several raw stops can map to one station (bus stop clusters) — keep
        // the earliest time, mirroring the GTFS generator.
        if (!stopTimes[code] || time < stopTimes[code]) stopTimes[code] = time;
      }
      if (orderedCodes.length >= 2) out.push({ tripNumber, vehicleType, orderedCodes, stopTimes });
    }
  }
  return out;
}

/**
 * The actual schedule for `serviceDate` (YYYYMMDD) on a line, from the live
 * API. Returns `{ toUnion: [], fromUnion: [] }` when the date genuinely has no
 * service (e.g. peak-only lines on holidays), or `null` when the API couldn't
 * be reached — callers should then fall back to the static GTFS schedule.
 */
export async function getLiveDaySchedule(
  lineId: string,
  serviceDate: string,
): Promise<DaySchedule | null> {
  const dirs = LINE_DIRECTIONS[lineId];
  if (!dirs || !/^\d{8}$/.test(serviceDate)) return null;
  const apiCode = metrolinxLineCode(lineId);

  let trips: NormalizedTrip[];
  try {
    const trainPages = await Promise.all(
      dirs.map((d) => fetchLineTrips(apiCode, d, serviceDate)),
    );
    trips = trainPages.flat();
  } catch {
    return null; // API unreachable → let the caller use the static schedule
  }

  // Buses are supplementary — if their fetch fails, still serve the trains.
  const bus = BUS_CONFIG[lineId];
  if (bus) {
    const busPages = await Promise.all(
      bus.routes.flatMap((r) =>
        dirs.map((d) => fetchLineTrips(r, d, serviceDate, bus.stopMap).catch(() => [])),
      ),
    );
    trips = trips.concat(busPages.flat());
  }

  const toUnion: GtfsTrip[] = [];
  const fromUnion: GtfsTrip[] = [];
  for (const t of trips) {
    const unIdx = t.orderedCodes.indexOf(UNION);
    if (unIdx < 0) continue;
    const entry: GtfsTrip = {
      // Same shape as GTFS trip_ids ("20260701-ST-7422") so tripNumberFromId
      // and every existing join keep working.
      tripId: `${serviceDate}-${apiCode}-${t.tripNumber}`,
      vehicleType: t.vehicleType,
      stopTimes: t.stopTimes,
    };
    // Union mid-trip = a through trip; it serves both directions' riders.
    if (unIdx > 0) toUnion.push(entry);
    if (unIdx < t.orderedCodes.length - 1) fromUnion.push(entry);
  }

  return { toUnion, fromUnion };
}
