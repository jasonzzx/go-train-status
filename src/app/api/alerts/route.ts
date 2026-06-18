import { NextResponse } from 'next/server';

export const revalidate = 60; // cache for 60 seconds at the edge

export interface ParsedAlert {
  id: string;
  /** Short title, e.g. "Delay of 6 minutes 31 seconds" */
  title: string;
  /** "northbound" = Union→Unionville (officeToHome); "southbound" = Unionville→Union (homeToOffice) */
  direction: 'northbound' | 'southbound' | 'both';
  /** Departure time from the "Scheduled" field, e.g. "17:32" */
  scheduledDeparture: string;
  /** Arrival time from the "Scheduled" field, e.g. "18:45" */
  scheduledArrival: string;
  /** "Moving" | "Stopped" | "Cancelled" | "" */
  status: string;
  /** Human-readable reason */
  reason: string;
  /** From station name */
  fromStation: string;
  /** To station name */
  toStation: string;
}

// ---------------------------------------------------------------------------
// HTML parser – works if Go Transit ever adds SSR for alert cards
// ---------------------------------------------------------------------------
function parseAlertsFromHtml(html: string): ParsedAlert[] {
  const alerts: ParsedAlert[] = [];

  // Each alert block typically contains:
  //   <span>Delay of X minutes Y seconds</span>
  //   <span>Station A to Station B (DIRECTION)</span>
  //   <span>Scheduled: HH:MM - HH:MM</span>
  //   <span>Status: ...</span>
  //   <span>Reason: ...</span>
  //
  // We look for the scheduled-time pattern as an anchor and grab surrounding context.

  const scheduledPattern = /Scheduled:\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/gi;
  let match: RegExpExecArray | null;

  while ((match = scheduledPattern.exec(html)) !== null) {
    const dep = match[1];
    const arr = match[2];
    const pos = match.index;

    // Grab ~1000 chars before and after for context
    const before = html.slice(Math.max(0, pos - 1000), pos);
    const after = html.slice(pos, Math.min(html.length, pos + 500));

    // Extract title (delay / cancellation text)
    const titleMatch =
      before.match(/(?:Delay of[^<"]+|Train cancelled[^<"]*|Service change[^<"]*|No service[^<"]*)(?=[<"])/i) ||
      after.match(/(?:Delay of[^<"]+|Train cancelled[^<"]*|Service change[^<"]*|No service[^<"]*)(?=[<"])/i);
    const title = titleMatch ? titleMatch[0].trim() : 'Service Alert';

    // Extract "Station A to Station B (DIRECTION)"
    const routeMatch = before.match(/([^<>]+)\s+to\s+([^<>(]+)\s*\((NORTHBOUND|SOUTHBOUND)\)/i) ||
      after.match(/([^<>]+)\s+to\s+([^<>(]+)\s*\((NORTHBOUND|SOUTHBOUND)\)/i);
    const fromStation = routeMatch ? routeMatch[1].trim() : '';
    const toStation = routeMatch ? routeMatch[2].trim() : '';
    const rawDir = routeMatch ? routeMatch[3].toUpperCase() : '';
    const direction: ParsedAlert['direction'] = rawDir === 'NORTHBOUND' ? 'northbound' : rawDir === 'SOUTHBOUND' ? 'southbound' : 'both';

    // Extract Status
    const statusMatch = after.match(/Status:\s*([^\n<,]+)/i);
    const status = statusMatch ? statusMatch[1].trim() : '';

    // Extract Reason
    const reasonMatch = after.match(/Reason:\s*([^\n<]+)/i);
    const reason = reasonMatch ? reasonMatch[1].trim() : '';

    alerts.push({
      id: `${dep}-${arr}-${direction}`,
      title,
      direction,
      scheduledDeparture: dep,
      scheduledArrival: arr,
      status,
      reason,
      fromStation,
      toStation,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Attempt to extract embedded JSON from the Next.js __NEXT_DATA__ script tag
// ---------------------------------------------------------------------------
function parseAlertsFromNextData(html: string): ParsedAlert[] | null {
  const scriptMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return null;

  try {
    const data = JSON.parse(scriptMatch[1]);
    // Drill into props.pageProps – shape is unknown, do a best-effort walk
    const alerts = findAlertArray(data);
    if (alerts && alerts.length > 0) return alerts;
  } catch {
    // ignore parse errors
  }
  return null;
}

function findAlertArray(obj: unknown, depth = 0): ParsedAlert[] | null {
  if (depth > 10 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    // Heuristic: an alert array item has a "scheduledDeparture" or "Scheduled" key
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      const first = obj[0] as Record<string, unknown>;
      if ('scheduledDeparture' in first || 'scheduled' in first || 'delayMinutes' in first) {
        // Map best-effort
        return obj.map((a: Record<string, unknown>, i: number) => ({
          id: String(i),
          title: String(a.title ?? a.headline ?? 'Service Alert'),
          direction: parseDirection(String(a.direction ?? '')),
          scheduledDeparture: String(a.scheduledDeparture ?? a.departureTime ?? ''),
          scheduledArrival: String(a.scheduledArrival ?? a.arrivalTime ?? ''),
          status: String(a.status ?? ''),
          reason: String(a.reason ?? ''),
          fromStation: String(a.fromStation ?? a.origin ?? ''),
          toStation: String(a.toStation ?? a.destination ?? ''),
        }));
      }
    }
    return null;
  }
  for (const val of Object.values(obj as Record<string, unknown>)) {
    const result = findAlertArray(val, depth + 1);
    if (result) return result;
  }
  return null;
}

function parseDirection(s: string): ParsedAlert['direction'] {
  const u = s.toUpperCase();
  if (u.includes('NORTH')) return 'northbound';
  if (u.includes('SOUTH')) return 'southbound';
  return 'both';
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET() {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-CA,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: 'https://www.gotransit.com/',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  try {
    const res = await fetch(
      'https://www.gotransit.com/en/service-updates?mode=t&code=ST',
      { headers, next: { revalidate: 60 } }
    );

    if (!res.ok) {
      return NextResponse.json(
        { alerts: [], available: false, lastUpdated: null, error: `HTTP ${res.status}` },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
      );
    }

    const html = await res.text();

    // Try structured Next.js data first, fall back to HTML text parsing
    const alerts =
      parseAlertsFromNextData(html) ??
      parseAlertsFromHtml(html);

    return NextResponse.json(
      {
        alerts,
        available: true,
        lastUpdated: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { alerts: [], available: false, lastUpdated: null, error: message },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  }
}
