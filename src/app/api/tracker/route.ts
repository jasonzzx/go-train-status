import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';

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

export async function GET(request: NextRequest): Promise<NextResponse<TrackerResponse>> {
  const homeSlug = request.nextUrl.searchParams.get('home') ?? 'unionville';
  const { sb: RAILSIX_SB, nb: RAILSIX_NB } = buildRailsixUrls(homeSlug);

  // No CDN/browser caching — the client polls every 30s itself
  const cacheHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

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
      { trips, available: true, lastUpdated: new Date().toISOString() },
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
