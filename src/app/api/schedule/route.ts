import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { metrolinxEnabled } from '@/lib/metrolinx/client';
import { getLiveDaySchedule, type DaySchedule } from '@/lib/metrolinx/schedule';

// The day schedule for a specific date, from the official API. The client
// renders the bundled static GTFS schedule immediately and swaps to this when
// it arrives, so holidays / service changes show the trips that actually run.
export interface ScheduleResponse extends Partial<DaySchedule> {
  available: boolean;
  source?: 'metrolinx';
}

export const dynamic = 'force-dynamic';

// A date's schedule barely changes intraday — let the CDN absorb repeat loads.
const cacheHeaders = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
};

export async function GET(request: NextRequest): Promise<NextResponse<ScheduleResponse>> {
  const lineId = request.nextUrl.searchParams.get('code')?.toUpperCase() ?? '';
  const date = request.nextUrl.searchParams.get('date') ?? ''; // "YYYY-MM-DD"
  const compact = date.replace(/-/g, '');

  if (!lineId || !/^\d{8}$/.test(compact) || !metrolinxEnabled()) {
    return NextResponse.json({ available: false }, { headers: cacheHeaders });
  }

  const day = await getLiveDaySchedule(lineId, compact);
  if (!day) {
    return NextResponse.json({ available: false }, { headers: cacheHeaders });
  }
  return NextResponse.json(
    { available: true, source: 'metrolinx' as const, ...day },
    { headers: cacheHeaders },
  );
}
