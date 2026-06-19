// ── Station config ────────────────────────────────────────

export interface StationInfo {
  name: string;         // "Unionville GO"
  shortName: string;    // "Unionville"
  code: string;         // "UI"
  railsixSlug: string;  // "unionville" — railsix.com route URL slug
}

// All Stouffville line home stations (excludes Union Station which is always the office)
// Ordered north → south (Old Elm end → Toronto end)
export const STOUFFVILLE_HOME_STATIONS: StationInfo[] = [
  { name: 'Old Elm GO',     shortName: 'Old Elm',     code: 'OE', railsixSlug: 'old-elm'     },
  { name: 'Stouffville GO', shortName: 'Stouffville', code: 'ER', railsixSlug: 'stouffville' },
  { name: 'Mount Joy GO',   shortName: 'Mount Joy',   code: 'MJ', railsixSlug: 'mount-joy'   },
  { name: 'Markham GO',     shortName: 'Markham',     code: 'MK', railsixSlug: 'markham'     },
  { name: 'Centennial GO',  shortName: 'Centennial',  code: 'CN', railsixSlug: 'centennial'  },
  { name: 'Unionville GO',  shortName: 'Unionville',  code: 'UI', railsixSlug: 'unionville'  },
  { name: 'Milliken GO',    shortName: 'Milliken',    code: 'ML', railsixSlug: 'milliken'    },
  { name: 'Agincourt GO',   shortName: 'Agincourt',   code: 'AO', railsixSlug: 'agincourt'   },
  { name: 'Kennedy GO',     shortName: 'Kennedy',     code: 'KE', railsixSlug: 'kennedy'     },
];

export const DEFAULT_HOME_STATION_CODE = 'UI';

export function getStationByCode(code: string): StationInfo {
  return STOUFFVILLE_HOME_STATIONS.find((s) => s.code === code) ?? STOUFFVILLE_HOME_STATIONS[5]; // fallback UI
}

// ── Trip types ────────────────────────────────────────────

export interface Trip {
  departure: string;              // "HH:MM" from home station
  arrival: string;                // "HH:MM" at office (Union) or at home (NB)
  tripTime: string;               // "N min"
  vehicleType: 'train' | 'bus';  // bus = Unionville-only express replacement
}

export type ServiceType = 'weekday' | 'saturday' | 'sunday';
export type Direction = 'homeToOffice' | 'officeToHome';

// ── Station timing tables ─────────────────────────────────
// All trains on the Stouffville line serve all stations; schedules for other
// stations are derived from the verified Unionville base data below.
//
// SB (home→Union): south stations depart later than Unionville (positive offset),
//                  north stations depart earlier (negative offset).
// NB (Union→home): south stations are reached before Unionville, north after.
//
// Values for UI↔UN are verified from GO Transit timetables + railsix.com.
// Values for north-of-UI stations (CN, MK, MJ, ER, OE) are estimated.

// Minutes remaining to Union Station from each stop (SB direction)
export const SB_MINS_TO_UNION: Record<string, number> = {
  OE: 84, ER: 69, MJ: 59, MK: 51, CN: 46,
  UI: 41,
  ML: 34, AO: 29, KE: 21, UN: 0,
};

// Minutes from Union Station to each stop (NB direction)
export const NB_MINS_FROM_UNION: Record<string, number> = {
  UN: 0, KE: 18, AO: 25, ML: 31,
  UI: 40,
  CN: 45, MK: 50, MJ: 58, ER: 70, OE: 85,
};

// SB departure offset vs Unionville (= 41 − SB_MINS_TO_UNION[code])
const SB_OFFSET_FROM_UI: Record<string, number> = Object.fromEntries(
  Object.entries(SB_MINS_TO_UNION).map(([code, mins]) => [code, 41 - mins]),
);

// Full ordered stop lists (used by getStops)
const FULL_LINE_SB: { name: string; code: string }[] = [
  { name: 'Old Elm GO',     code: 'OE' },
  { name: 'Stouffville GO', code: 'ER' },
  { name: 'Mount Joy GO',   code: 'MJ' },
  { name: 'Markham GO',     code: 'MK' },
  { name: 'Centennial GO',  code: 'CN' },
  { name: 'Unionville GO',  code: 'UI' },
  { name: 'Milliken GO',    code: 'ML' },
  { name: 'Agincourt GO',   code: 'AO' },
  { name: 'Kennedy GO',     code: 'KE' },
  { name: 'Union Station',  code: 'UN' },
];
const FULL_LINE_NB = [...FULL_LINE_SB].reverse();

// Name → code mapping for live stop name resolution
const STOP_CODE_MAP: Record<string, string> = {
  'old elm': 'OE', 'stouffville': 'ER', 'mount joy': 'MJ', 'markham': 'MK',
  'centennial': 'CN', 'unionville': 'UI', 'milliken': 'ML', 'agincourt': 'AO',
  'kennedy': 'KE', 'union station': 'UN', 'union': 'UN',
};

// ── Unionville base schedule (verified from GO Transit, eff. June 13, 2026) ──

// Unionville GO (UI) → Union Station (UN)
// Bus trips are Unionville-only express replacements (no intermediate stops).
const homeToOfficeWeekday: Trip[] = [
  { departure: '05:15', arrival: '05:45', tripTime: '30 min', vehicleType: 'bus'   },
  { departure: '05:39', arrival: '06:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '06:39', arrival: '07:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '07:09', arrival: '07:50', tripTime: '41 min', vehicleType: 'train' },
  { departure: '07:39', arrival: '08:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '07:59', arrival: '08:40', tripTime: '41 min', vehicleType: 'train' },
  { departure: '08:09', arrival: '08:50', tripTime: '41 min', vehicleType: 'train' },
  { departure: '08:39', arrival: '09:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '09:39', arrival: '10:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '10:39', arrival: '11:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '11:39', arrival: '12:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '12:39', arrival: '13:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '13:39', arrival: '14:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '14:39', arrival: '15:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '15:39', arrival: '16:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '16:25', arrival: '17:20', tripTime: '55 min', vehicleType: 'bus'   },
  { departure: '16:30', arrival: '17:25', tripTime: '55 min', vehicleType: 'bus'   },
  { departure: '16:36', arrival: '17:17', tripTime: '41 min', vehicleType: 'train' },
  { departure: '17:39', arrival: '18:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '18:50', arrival: '19:35', tripTime: '45 min', vehicleType: 'train' },
  { departure: '19:39', arrival: '20:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '20:39', arrival: '21:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '21:39', arrival: '22:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '22:39', arrival: '23:20', tripTime: '41 min', vehicleType: 'train' },
  { departure: '23:40', arrival: '00:10', tripTime: '30 min', vehicleType: 'bus'   },
  { departure: '01:45', arrival: '02:15', tripTime: '30 min', vehicleType: 'bus'   },
];

// Union Station (UN) → Unionville GO (UI)
const officeToHomeWeekday: Trip[] = [
  { departure: '06:43', arrival: '07:13', tripTime: '30 min', vehicleType: 'bus'   },
  { departure: '07:48', arrival: '08:25', tripTime: '37 min', vehicleType: 'train' },
  { departure: '09:00', arrival: '09:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '10:00', arrival: '10:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '11:00', arrival: '11:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '12:00', arrival: '12:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '13:00', arrival: '13:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '14:00', arrival: '14:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '15:00', arrival: '15:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '15:32', arrival: '16:13', tripTime: '41 min', vehicleType: 'train' },
  { departure: '16:00', arrival: '16:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '16:30', arrival: '17:10', tripTime: '40 min', vehicleType: 'train' },
  { departure: '16:50', arrival: '17:31', tripTime: '41 min', vehicleType: 'train' },
  { departure: '17:00', arrival: '17:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '17:32', arrival: '18:12', tripTime: '40 min', vehicleType: 'train' },
  { departure: '18:15', arrival: '18:55', tripTime: '40 min', vehicleType: 'train' },
  { departure: '19:00', arrival: '19:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '20:00', arrival: '20:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '21:00', arrival: '21:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '22:00', arrival: '22:40', tripTime: '40 min', vehicleType: 'train' },
  { departure: '23:00', arrival: '23:39', tripTime: '39 min', vehicleType: 'train' },
  { departure: '00:01', arrival: '00:39', tripTime: '38 min', vehicleType: 'bus'   },
  { departure: '01:10', arrival: '01:35', tripTime: '25 min', vehicleType: 'bus'   },
  { departure: '02:45', arrival: '03:10', tripTime: '25 min', vehicleType: 'bus'   },
];

// Base schedule keyed by direction + service type (Unionville times)
const scheduleData: Record<Direction, Record<ServiceType, Trip[]>> = {
  homeToOffice: { weekday: homeToOfficeWeekday, saturday: [], sunday: [] },
  officeToHome: { weekday: officeToHomeWeekday, saturday: [], sunday: [] },
};

export const SCHEDULE_EFFECTIVE_DATE = 'June 13, 2026';

// ── Schedule derivation ───────────────────────────────────

/**
 * Returns the schedule for any home station by deriving from the Unionville base
 * schedule using station timing offsets. Buses are Unionville-only; all other
 * stations show train-only schedules.
 */
export function getScheduleForStation(
  direction: Direction,
  serviceType: ServiceType,
  stationCode: string,
): Trip[] {
  const base = scheduleData[direction][serviceType] ?? [];
  if (stationCode === 'UI') return base;

  const trains = base.filter((t) => t.vehicleType === 'train');

  if (direction === 'homeToOffice') {
    const offset = SB_OFFSET_FROM_UI[stationCode] ?? 0;
    return trains.map((t) => {
      const depMins = timeToMinutes(t.departure) + offset;
      const arrMins = timeToMinutes(t.arrival); // Union arrival is unchanged
      return { ...t, departure: minutesToTime(depMins), tripTime: `${arrMins - depMins} min` };
    });
  } else {
    const stationNBMins = NB_MINS_FROM_UNION[stationCode];
    if (stationNBMins === undefined) return trains;

    const uiNBMins = NB_MINS_FROM_UNION['UI'] ?? 40;

    if (stationNBMins <= uiNBMins) {
      // South-of-UI station: fixed duration from Union (train arrives before Unionville)
      return trains.map((t) => ({
        ...t,
        arrival: minutesToTime(timeToMinutes(t.departure) + stationNBMins),
        tripTime: `${stationNBMins} min`,
      }));
    } else {
      // North-of-UI station: arrival = UI arrival + extra minutes past Unionville
      const extraPastUI = stationNBMins - uiNBMins;
      return trains.map((t) => {
        const uiArrMins = timeToMinutes(t.arrival); // t.arrival is Unionville arrival in base schedule
        const stationArrMins = uiArrMins + extraPastUI;
        return {
          ...t,
          arrival: minutesToTime(stationArrMins),
          tripTime: `${stationArrMins - timeToMinutes(t.departure)} min`,
        };
      });
    }
  }
}

// ── Stop sequence ─────────────────────────────────────────

export interface StationStop {
  name: string;
  code: string;
  scheduledTime: string;    // "HH:MM"
  scheduledMinutes: number; // absolute minutes from midnight
}

/**
 * Returns the ordered stop sequence for a trip with estimated arrival times at
 * each stop. Works for any home station on the Stouffville line.
 *
 * @param homeCode - Station code of the home station (default: 'UI')
 * @param liveStops - Optional live stop names from railsix tracker (overrides static names)
 */
export function getStops(
  trip: Trip,
  direction: Direction,
  homeCode: string = 'UI',
  liveStops?: string[],
): StationStop[] {
  const depMins = timeToMinutes(trip.departure);
  const isBus = trip.vehicleType === 'bus';

  if (isBus) {
    // Buses are direct Unionville ↔ Union, no intermediate stops
    const origin = direction === 'homeToOffice'
      ? { name: 'Unionville GO', code: 'UI' }
      : { name: 'Union Station', code: 'UN' };
    const dest = direction === 'homeToOffice'
      ? { name: 'Union Station', code: 'UN' }
      : { name: 'Unionville GO', code: 'UI' };
    const totalMins = parseInt(trip.tripTime, 10);
    return [
      { ...origin, scheduledMinutes: depMins,             scheduledTime: minutesToTime(depMins) },
      { ...dest,   scheduledMinutes: depMins + totalMins, scheduledTime: minutesToTime(depMins + totalMins) },
    ];
  }

  if (direction === 'homeToOffice') {
    // SB: home station → Union. Include all stops from homeCode to UN.
    const homeToUnion = SB_MINS_TO_UNION[homeCode] ?? SB_MINS_TO_UNION['UI'];
    const stops = FULL_LINE_SB.filter(
      (s) => (SB_MINS_TO_UNION[s.code] ?? -1) >= 0 && (SB_MINS_TO_UNION[s.code] ?? -1) <= homeToUnion,
    );

    if (liveStops && liveStops.length > 0) {
      return applyLiveStops(stops, liveStops, depMins, 'SB');
    }

    return stops.map((s) => {
      const minsFromHome = homeToUnion - (SB_MINS_TO_UNION[s.code] ?? 0);
      return { ...s, scheduledMinutes: depMins + minsFromHome, scheduledTime: minutesToTime(depMins + minsFromHome) };
    });
  } else {
    // NB: Union → home station. Include all stops from UN up to homeCode.
    const unionToHome = NB_MINS_FROM_UNION[homeCode] ?? NB_MINS_FROM_UNION['UI'];
    const stops = FULL_LINE_NB.filter(
      (s) => (NB_MINS_FROM_UNION[s.code] ?? Infinity) <= unionToHome,
    );

    if (liveStops && liveStops.length > 0) {
      return applyLiveStops(stops, liveStops, depMins, 'NB');
    }

    return stops.map((s) => {
      const minsFromUnion = NB_MINS_FROM_UNION[s.code] ?? 0;
      return { ...s, scheduledMinutes: depMins + minsFromUnion, scheduledTime: minutesToTime(depMins + minsFromUnion) };
    });
  }
}

/**
 * Merges railsix live stop names into the computed stop sequence.
 * Uses static timing tables for arrival time estimates regardless of live names.
 */
function applyLiveStops(
  staticStops: { name: string; code: string }[],
  liveStops: string[],
  depMins: number,
  dir: 'SB' | 'NB',
): StationStop[] {
  const dest = staticStops[staticStops.length - 1];
  const origin = staticStops[0];
  const destName = dest.name.toLowerCase().replace(/ go$/, '').trim();

  const destIdx = liveStops.findIndex(
    (s) =>
      s.toLowerCase().replace(/ go$/, '').trim() === destName ||
      s.toLowerCase().includes(destName),
  );
  const relevant = destIdx >= 0 ? liveStops.slice(0, destIdx + 1) : liveStops;

  const merged = [
    origin,
    ...relevant.map((name) => {
      const key = name.toLowerCase().replace(/ go$/, '').trim();
      return { name, code: STOP_CODE_MAP[key] ?? key.substring(0, 2).toUpperCase() };
    }),
  ];

  return merged.map((s) => {
    const mins =
      dir === 'SB'
        ? (SB_MINS_TO_UNION[origin.code] ?? 41) - (SB_MINS_TO_UNION[s.code] ?? 0)
        : (NB_MINS_FROM_UNION[s.code] ?? 0);
    return { ...s, scheduledMinutes: depMins + mins, scheduledTime: minutesToTime(depMins + mins) };
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
