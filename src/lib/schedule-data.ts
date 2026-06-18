export interface Trip {
  departure: string;              // "HH:MM"
  arrival: string;                // "HH:MM"
  tripTime: string;               // "N min"
  vehicleType: 'train' | 'bus';  // service mode
}

export type ServiceType = 'weekday' | 'saturday' | 'sunday';
export type Direction = 'homeToOffice' | 'officeToHome';

// Schedule data scraped from gotransit.com (Stouffville line, effective June 13, 2026)
// Unionville GO (UI) → Union Station (UN)
// Bus: late-night/early-morning departures + 55-min peak-hour bus trips
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

export const scheduleData: Record<Direction, Record<ServiceType, Trip[]>> = {
  homeToOffice: {
    weekday: homeToOfficeWeekday,
    saturday: [],
    sunday: [],
  },
  officeToHome: {
    weekday: officeToHomeWeekday,
    saturday: [],
    sunday: [],
  },
};

export const SCHEDULE_EFFECTIVE_DATE = 'June 13, 2026';

// ── Intermediate station stops ────────────────────────────
export interface StationStop {
  name: string;
  code: string;
  scheduledTime: string;    // "HH:MM" display
  scheduledMinutes: number; // absolute minutes from midnight (may exceed 1440 for overnight)
}

// Verified from railsix.com live data: Stouffville line train stops UI↔UN
// Trains: Unionville → Milliken → Agincourt → Kennedy → Union (3 intermediate stops)
// Note: Scarborough GO and Danforth GO are on the Lakeshore line — NOT on Stouffville.
const TRAIN_SB_STOPS = [
  { name: 'Unionville GO', code: 'UI' },
  { name: 'Milliken GO',   code: 'ML' },
  { name: 'Agincourt GO',  code: 'AO' },
  { name: 'Kennedy GO',    code: 'KE' },
  { name: 'Union Station', code: 'UN' },
];

const TRAIN_NB_STOPS = [
  { name: 'Union Station', code: 'UN' },
  { name: 'Kennedy GO',    code: 'KE' },
  { name: 'Agincourt GO',  code: 'AO' },
  { name: 'Milliken GO',   code: 'ML' },
  { name: 'Unionville GO', code: 'UI' },
];

// Bus trips are direct express (no intermediate stops between Unionville and Union)
const BUS_SB_STOPS = [
  { name: 'Unionville GO', code: 'UI' },
  { name: 'Union Station', code: 'UN' },
];

const BUS_NB_STOPS = [
  { name: 'Union Station', code: 'UN' },
  { name: 'Unionville GO', code: 'UI' },
];

// Fractional offsets calibrated to Stouffville line segment times:
// SB (~41 min): UI=0, ML≈7min, AO≈12min, KE≈20min, UN=41min
const TRAIN_SB_FRACTIONS = [0, 0.17, 0.29, 0.49, 1.0];
// NB (~40 min): UN=0, KE≈18min, AO≈25min, ML≈31min, UI=40min
const TRAIN_NB_FRACTIONS = [0, 0.45, 0.625, 0.775, 1.0];
// Bus: direct
const BUS_FRACTIONS = [0, 1.0];

function minutesToTime(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Returns the stop sequence for a trip with estimated arrival times at each stop.
 * Trains: 5 stations (3 intermediate). Buses: 2 stations (direct, no intermediate).
 * When live stop data is available from the tracker, pass liveStops to override station names.
 */
export function getStops(
  trip: Trip,
  direction: Direction,
  liveStops?: string[]   // optional: stop names from railsix tracker
): StationStop[] {
  const depMins   = timeToMinutes(trip.departure);
  const totalMins = parseInt(trip.tripTime, 10);
  const isBus     = trip.vehicleType === 'bus';

  // Choose base stop list and fractions by vehicle type + direction
  let bases: { name: string; code: string }[];
  let fracs: number[];

  if (isBus) {
    bases = direction === 'homeToOffice' ? BUS_SB_STOPS : BUS_NB_STOPS;
    fracs = BUS_FRACTIONS;
  } else {
    bases = direction === 'homeToOffice' ? TRAIN_SB_STOPS : TRAIN_NB_STOPS;
    fracs = direction === 'homeToOffice' ? TRAIN_SB_FRACTIONS : TRAIN_NB_FRACTIONS;
  }

  // If live stop names from railsix are available, build matching bases from them.
  // liveStops includes all stops AFTER the origin, including destination.
  // We reconstruct: [origin, ...liveStops] and pick only stops up to our destination.
  if (liveStops && liveStops.length > 0 && !isBus) {
    const origin = bases[0];
    const dest   = bases[bases.length - 1];
    const destName = dest.name.toLowerCase().replace(/ go$/, '').trim();

    // Build live stop name→code map from our known station list
    const codeMap: Record<string, string> = {
      'unionville': 'UI', 'milliken': 'ML', 'agincourt': 'AO',
      'kennedy': 'KE', 'union station': 'UN', 'union': 'UN',
    };

    // Filter live stops up to and including our destination
    const destIdx = liveStops.findIndex(s =>
      s.toLowerCase().replace(/ go$/, '').trim() === destName ||
      s.toLowerCase().includes(destName)
    );
    const relevantStops = destIdx >= 0 ? liveStops.slice(0, destIdx + 1) : liveStops;

    // Build bases from live data
    const liveBases = [origin, ...relevantStops.map(name => {
      const key = name.toLowerCase().replace(/ go$/, '').trim();
      return { name: name.replace(/ GO$/, ' GO'), code: codeMap[key] ?? key.substring(0, 2).toUpperCase() };
    })];

    // Recalculate fractions proportionally for the new stop count
    const n = liveBases.length - 1;
    const liveFrags = liveBases.map((_, i) => (i === 0 ? 0 : i === n ? 1.0 : fracs[Math.min(i, fracs.length - 2)]));

    return liveBases.map((s, i) => {
      const absMins = depMins + Math.round(liveFrags[i] * totalMins);
      return { ...s, scheduledMinutes: absMins, scheduledTime: minutesToTime(absMins) };
    });
  }

  return bases.map((s, i) => {
    const absMins = depMins + Math.round(fracs[i] * totalMins);
    return { ...s, scheduledMinutes: absMins, scheduledTime: minutesToTime(absMins) };
  });
}

export function getServiceType(date: Date): ServiceType {
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
}

/** Convert "HH:MM" to total minutes from midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
