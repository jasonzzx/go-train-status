import { NextResponse, type NextRequest } from 'next/server';
import { metrolinxEnabled } from '@/lib/metrolinx/client';
import { getUnionDepartures } from '@/lib/metrolinx/trains';
import { savePlatforms, torontoDateStr, platformStoreEnabled } from '@/lib/platform-store';

// Captures the platforms GO publishes for upcoming Union departures and stores
// them keyed by service day, so /api/tracker can show a platform for a train
// that has ALREADY departed (when GO has wiped it from every live endpoint).
//
// Drive this from an external scheduler (e.g. cron-job.org on Hobby) every
// ~5 min during service hours, with the shared secret:
//   GET /api/cron/platforms        Authorization: Bearer $CRON_SECRET
//   GET /api/cron/platforms?secret=$CRON_SECRET   (alternative)

export const dynamic = 'force-dynamic';

/** Current hour in America/Toronto (0-23). */
function torontoHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto',
      hour: '2-digit',
      hour12: false,
    }).format(new Date())
  );
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // refuse until a secret is configured
  const header = request.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  return request.nextUrl.searchParams.get('secret') === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!platformStoreEnabled()) {
    return NextResponse.json({ ok: false, error: 'store not configured' }, { status: 503 });
  }
  if (!metrolinxEnabled()) {
    return NextResponse.json({ ok: false, error: 'metrolinx not enabled' }, { status: 503 });
  }

  // No GO train service ~02:00-03:59 — skip to save API + store calls.
  const hour = torontoHour();
  if (hour === 2 || hour === 3) {
    return NextResponse.json({ ok: true, skipped: 'outside service hours', captured: 0 });
  }

  try {
    const departures = await getUnionDepartures();
    const platforms: Record<string, string> = {};
    for (const t of departures) {
      const num = t.TripNumber;
      const plat = t.Platform && t.Platform !== '-' ? t.Platform : '';
      if (num && plat) platforms[num] = plat;
    }
    const captured = await savePlatforms(torontoDateStr(), platforms);
    return NextResponse.json({ ok: true, captured, seen: departures.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
