import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { getLine } from '@/lib/lines';
import { getScheduleForStation, getServiceType, type ServiceType } from '@/lib/schedule-data';
import { metrolinxEnabled } from '@/lib/metrolinx/client';
import { getLiveStatusByTripNumber, tripNumberFromId, getScheduledPlatform } from '@/lib/metrolinx/trains';
import { getStoredPlatforms, torontoDateStr } from '@/lib/platform-store';

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
  const [liveStatus, storedPlatforms] = await Promise.all([
    getLiveStatusByTripNumber(line.id),
    getStoredPlatforms(torontoDateStr()),
  ]);

  // Collect live trip numbers so we can batch-fetch home-station platforms
  // from Schedule/Trip in parallel (each call is cached 2 min).
  const directions = [
    { direction: 'homeToOffice' as const, directionCd: 'Inbound' as const },
    { direction: 'officeToHome' as const, directionCd: 'Outbound' as const },
  ];

  const liveTripNumbers = new Set<string>();
  for (const { direction } of directions) {
    for (const trip of getScheduleForStation(line.id, direction, serviceType, homeCode)) {
      const tn = tripNumberFromId(trip.tripId);
      if (liveStatus.has(tn)) liveTripNumbers.add(tn);
    }
  }

  // Fetch scheduled platform at the home station for every live trip.
  // Outbound: this is the arrival platform (fallback when Union platform is gone).
  // Inbound: this is the boarding platform (primary source).
  const homePlatforms = new Map<string, string>();
  const results = await Promise.all(
    Array.from(liveTripNumbers).map(async (tn) => [tn, await getScheduledPlatform(tn, homeCode)] as const),
  );
  for (const [tn, plat] of results) {
    if (plat) homePlatforms.set(tn, plat);
  }

  const trips: TrackerTrip[] = [];

  for (const { direction, directionCd } of directions) {
    const schedule = getScheduleForStation(line.id, direction, serviceType, homeCode);
    for (const trip of schedule) {
      const tripNumber = tripNumberFromId(trip.tripId);
      const status = liveStatus.get(tripNumber);
      if (!status || !status.hasLive) continue;

      let expected = 'On Time';
      if (status.cancelled) expected = 'Cancelled';
      else if (status.delayMin > 0) expected = `+${status.delayMin} min`;

      // Union platform (live or cron-captured), then home-station scheduled platform.
      const platform = status.platform || storedPlatforms[tripNumber] || homePlatforms.get(tripNumber) || '';

      trips.push({
        scheduledTime: trip.departure,
        directionCd,
        platform,
        expected,
        delay: status.delayMin,
        cancelled: status.cancelled,
        tripNumber,
        arrivalTime: trip.arrival,
        cars: status.cars,
        arriveIn: '',
        stops: [],
      });
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
