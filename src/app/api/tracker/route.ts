import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { getLine } from '@/lib/lines';
import {
  getScheduleForStation,
  tripsForStation,
  timeToMinutes,
  getServiceType,
  type ServiceType,
  type Trip,
} from '@/lib/schedule-data';
import { metrolinxEnabled } from '@/lib/metrolinx/client';
import {
  getLiveStatusByTripNumber,
  tripNumberFromId,
  getScheduledPlatform,
  torontoMinutesNow,
} from '@/lib/metrolinx/trains';
import { getLiveDaySchedule } from '@/lib/metrolinx/schedule';
import { getStoredPlatforms, savePlatforms, torontoDateStr } from '@/lib/platform-store';

// Railsix URL pattern: railsix.com/routes/{home-slug}-to-union (SB) / union-to-{home-slug} (NB)
function buildRailsixUrls(homeSlug: string) {
  return {
    sb: `https://railsix.com/routes/${homeSlug}-to-union`,
    nb: `https://railsix.com/routes/union-to-${homeSlug}`,
  };
}

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'en-CA,en;q=0.9',
};

export interface TrackerTrip {
  /** "HH:MM" — scheduled departure from origin station */
  scheduledTime: string;
  /** 'Inbound' = SB (Unionville→Union), 'Outbound' = NB (Union→Unionville) */
  directionCd: 'Inbound' | 'Outbound';
  /** Platform number, e.g. "2" or "-" if not yet assigned */
  platform: string;
  /** "On Time", "Delayed", "Cancelled", "Waiting" */
  expected: string;
  /** Delay in minutes (positive = late) */
  delay: number;
  /** True if cancelled */
  cancelled: boolean;
  /** Trip number */
  tripNumber: string;
  /** Arrival time at destination */
  arrivalTime: string;
  /** Live stop names from railsix (excludes origin, includes destination) */
  stops: string[];
  /** Number of cars */
  cars: string;
  /** Human-readable until departure */
  arriveIn: string;
}

export interface TrackerResponse {
  trips: TrackerTrip[];
  available: boolean;
  lastUpdated: string | null;
  source?: 'metrolinx' | 'railsix';
  error?: string;
}

// SvelteKit embeds live data in:
//   __sveltekit_XXXX.resolve(1, () => [[{...trips...}]])
// We extract the JS object literal and convert it to JSON.
function extractTrips(html: string): RailsixTrip[] {
  const match = html.match(/__sveltekit_\w+\.resolve\(\s*1\s*,\s*\(\)\s*=>\s*(\[\[[\s\S]*?\]\])\s*\)/);
  if (!match) return [];

  // Convert JS object-literal keys to JSON quoted keys:
  //   {key:"value"} → {"key":"value"}
  const jsonLike = match[1].replace(/([{,]\s*)(\w+):/g, '$1"$2":');

  try {
    const outer = JSON.parse(jsonLike) as RailsixTrip[][];
    return Array.isArray(outer[0]) ? outer[0] : [];
  } catch {
    return [];
  }
}

function toHHMM(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function mapTrip(raw: RailsixTrip, dir: 'Inbound' | 'Outbound'): TrackerTrip {
  const delayMs = (raw.actualAt ?? raw.scheduledAt) - raw.scheduledAt;
  const delayMin = Math.round(delayMs / 60_000);

  const rawStatus = raw.status ?? '';
  const cancelled = rawStatus.toLowerCase().includes('cancel');
  let expected = 'On Time';
  if (cancelled) {
    expected = 'Cancelled';
  } else if (rawStatus.toUpperCase() === 'WAIT') {
    expected = 'Waiting';
  } else if (delayMin > 0) {
    expected = `+${delayMin} min`;
  }

  // Arrival time: railsix gives it directly, or derive from actualAt + duration
  const arrivalTime = raw.arrivalTime ?? '';

  return {
    scheduledTime: raw.scheduledTime ?? '',
    directionCd: dir,
    platform: raw.platform && raw.platform !== '-' ? raw.platform : '',
    expected,
    delay: delayMin > 0 ? delayMin : 0,
    cancelled,
    tripNumber: raw.tripNumber ?? '',
    arrivalTime,
    cars: raw.cars ?? '',
    arriveIn: '',
    stops: raw.stops ?? [],
  };
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    cache: 'no-store',  // bypass Next.js data cache — always fetch live from railsix
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

export const dynamic = 'force-dynamic'; // prevent Vercel from caching this route at the edge

// No CDN/browser caching — the client polls every 30s itself
const cacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

export async function GET(request: NextRequest): Promise<NextResponse<TrackerResponse>> {
  const homeSlug = request.nextUrl.searchParams.get('home') ?? 'unionville';
  const lineId = request.nextUrl.searchParams.get('code')?.toUpperCase() ?? '';

  // Official Metrolinx API first (when enabled + verified); fall back to the
  // legacy railsix scraper on any error so behaviour can never regress.
  if (lineId && metrolinxEnabled()) {
    try {
      const trips = await buildOfficialTracker(lineId, homeSlug);
      return NextResponse.json(
        { trips, available: true, lastUpdated: new Date().toISOString(), source: 'metrolinx' as const },
        { headers: cacheHeaders }
      );
    } catch (err) {
      console.warn('Metrolinx tracker failed, falling back to railsix:', err);
    }
  }

  return scrapedTrackerResponse(homeSlug);
}

// ── Official Metrolinx tracker ─────────────────────────────────────────────
// Joins live status (by trip number) onto our GTFS schedule for today.

/** Today's GO service type, evaluated in the America/Toronto timezone. */
function torontoServiceType(): ServiceType {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    weekday: 'long',
  }).format(new Date());
  if (weekday === 'Sunday') return 'sunday';
  if (weekday === 'Saturday') return 'saturday';
  return 'weekday';
}

async function buildOfficialTracker(lineId: string, homeSlug: string): Promise<TrackerTrip[]> {
  const line = getLine(lineId);
  const homeCode = line.homeStations.find((s) => s.railsixSlug === homeSlug)?.code;
  if (!homeCode) throw new Error(`Unknown home station "${homeSlug}" on line ${lineId}`);

  const serviceType = torontoServiceType();
  const dateCompact = torontoDateStr().replace(/-/g, '');
  const [liveStatus, storedPlatforms, liveDay] = await Promise.all([
    getLiveStatusByTripNumber(line.id),
    getStoredPlatforms(torontoDateStr()),
    getLiveDaySchedule(line.id, dateCompact),
  ]);

  const directions = [
    { direction: 'homeToOffice' as const, directionCd: 'Inbound' as const },
    { direction: 'officeToHome' as const, directionCd: 'Outbound' as const },
  ];

  // Today's schedule: live Schedule/Line first (holiday-aware, so trip numbers
  // actually match the live feed on e.g. Canada Day), static GTFS as fallback.
  const scheduleByDirection = new Map<string, Trip[]>(
    directions.map(({ direction }) => [
      direction,
      liveDay
        ? tripsForStation(
            direction === 'homeToOffice' ? liveDay.toUnion : liveDay.fromUnion,
            direction,
            homeCode,
          )
        : getScheduleForStation(line.id, direction, serviceType, homeCode),
    ]),
  );

  // Batch-fetch the scheduled home-station platform (Schedule/Trip, cached
  // 2 min) for every live trip AND every train departing soon: Schedule/Trip
  // knows the home platform all day, so the "now"/"next" cards get a platform
  // even before the train enters service.
  // Outbound: it's the arrival platform (fallback once the Union one is gone).
  // Inbound: it's the boarding platform (primary source).
  const nowMin = torontoMinutesNow();
  const platformCandidates = new Set<string>();
  for (const { direction } of directions) {
    for (const trip of scheduleByDirection.get(direction)!) {
      if (trip.vehicleType === 'bus') continue; // street stops have no platform
      const tn = tripNumberFromId(trip.tripId);
      const dep = timeToMinutes(trip.departure);
      if (liveStatus.has(tn) || (dep >= nowMin - 30 && dep <= nowMin + 120)) {
        platformCandidates.add(tn);
      }
    }
  }

  const homePlatforms = new Map<string, string>();
  const results = await Promise.all(
    Array.from(platformCandidates).map(
      async (tn) => [tn, await getScheduledPlatform(tn, homeCode)] as const,
    ),
  );
  for (const [tn, plat] of results) {
    if (plat) homePlatforms.set(tn, plat);
  }

  const trips: TrackerTrip[] = [];
  // Platforms observed on this request that Redis doesn't have yet, persisted
  // below. The APIs wipe a platform the moment the train passes the stop
  // (Union departures AND Schedule/Trip Track — both verified live), so every
  // sighting must be remembered or the "now" card loses its platform mid-ride.
  const toPersist: Record<string, string> = {};

  for (const { direction, directionCd } of directions) {
    const schedule = scheduleByDirection.get(direction)!;
    for (const trip of schedule) {
      const tripNumber = tripNumberFromId(trip.tripId);
      const status = liveStatus.get(tripNumber);
      const hasLive = Boolean(status?.hasLive);

      // Platform: live Union value, else the one the cron/tracker captured
      // earlier today (Redis), else the home-station scheduled platform (live,
      // then its stored copy — Redis fields are `${trip}:${station}` since the
      // home platform is station-specific, unlike the Union `${trip}` fields).
      const homeKey = `${tripNumber}:${homeCode}`;
      const homePlat = homePlatforms.get(tripNumber) || '';
      const platform =
        status?.platform || storedPlatforms[tripNumber] || homePlat || storedPlatforms[homeKey] || '';

      if (status?.platform && storedPlatforms[tripNumber] !== status.platform) {
        toPersist[tripNumber] = status.platform;
      }
      if (homePlat && storedPlatforms[homeKey] !== homePlat) {
        toPersist[homeKey] = homePlat;
      }

      // Emit a row when there's a live signal OR a platform to carry. A departed
      // train that dropped out of the live feed but has a stored platform still
      // gets a row (platform only), so a cold open / other device can show it.
      if (!hasLive && !platform) continue;

      // Only assert on-time/delay when we actually have a live signal; a
      // platform-only row leaves `expected` empty (unknown status).
      let expected = '';
      if (hasLive) {
        expected = 'On Time';
        if (status!.cancelled) expected = 'Cancelled';
        else if (status!.delayMin > 0) expected = `+${status!.delayMin} min`;
      }

      trips.push({
        scheduledTime: trip.departure,
        directionCd,
        platform,
        expected,
        delay: status?.delayMin ?? 0,
        cancelled: status?.cancelled ?? false,
        tripNumber,
        arrivalTime: trip.arrival,
        cars: status?.cars ?? '',
        arriveIn: '',
        stops: [],
      });
    }
  }

  if (Object.keys(toPersist).length > 0) {
    try {
      await savePlatforms(torontoDateStr(), toPersist);
    } catch {
      // best-effort: the response still carries the fresh values
    }
  }

  return trips;
}

// ── Legacy railsix scraper (fallback) ──────────────────────────────────────

async function scrapedTrackerResponse(homeSlug: string): Promise<NextResponse<TrackerResponse>> {
  const { sb: RAILSIX_SB, nb: RAILSIX_NB } = buildRailsixUrls(homeSlug);

  try {
    const [sbHtml, nbHtml] = await Promise.all([
      fetchPage(RAILSIX_SB),
      fetchPage(RAILSIX_NB),
    ]);

    const sbRaw = extractTrips(sbHtml);
    const nbRaw = extractTrips(nbHtml);

    const trips: TrackerTrip[] = [
      ...sbRaw.map((t) => mapTrip(t, 'Inbound')),
      ...nbRaw.map((t) => mapTrip(t, 'Outbound')),
    ];

    return NextResponse.json(
      { trips, available: true, lastUpdated: new Date().toISOString(), source: 'railsix' as const },
      { headers: cacheHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { trips: [], available: false, lastUpdated: null, error: message },
      { headers: cacheHeaders }
    );
  }
}

// Raw shape from railsix.com SvelteKit SSR data
interface RailsixTrip {
  line?: string;
  lineName?: string;
  scheduledTime?: string;
  scheduledAt: number;
  actualAt?: number;
  arrivalTime?: string;
  status?: string;
  platform?: string;
  stops?: string[];
  lastStopId?: string;
  cars?: string;
  tripNumber?: string;
  routeType?: number;
}
