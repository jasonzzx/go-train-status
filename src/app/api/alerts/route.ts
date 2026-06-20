import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { getLine } from '@/lib/lines';

export const revalidate = 60; // cache for 60 seconds at the edge

export interface ParsedAlert {
  id: string;
  /** Short title, e.g. "Track work between Confederation GO and Niagara Falls GO" */
  title: string;
  /** "northbound" = Union→Unionville (officeToHome); "southbound" = Unionville→Union (homeToOffice) */
  direction: 'northbound' | 'southbound' | 'both';
  /** Departure time from the "Scheduled" field, e.g. "17:32" */
  scheduledDeparture: string;
  /** Arrival time from the "Scheduled" field, e.g. "18:45" */
  scheduledArrival: string;
  /** "Moving" | "Stopped" | "Cancelled" | "" */
  status: string;
  /** Human-readable description */
  reason: string;
  /** From station name */
  fromStation: string;
  /** To station name */
  toStation: string;
}

const GOTRANSIT_ALERTS_URL = 'https://www.gotransit.com/en/service-updates?mode=t';
const RAILSIX_ALERTS_URL = 'https://railsix.com/alerts';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-CA,en;q=0.9',
};

// ---------------------------------------------------------------------------
// HTML parser for gotransit.com service-updates — looks for service alerts
// organized by line. Falls back to railsix.com if no data.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// HTML parser for railsix.com/alerts — alerts are grouped per line, e.g.:
//
//   <details class="alert-group ...">
//     <summary class="group-head ..."><h2 class="rs-section-heading">Lakeshore West</h2>
//       <span class="group-count ...">2</span></summary>
//     <ul class="group-list ...">
//       <li class="alert-item ..."><details ...><summary ...>TITLE</summary>
//         <p class="alert-desc ...">DESCRIPTION</p></details></li>
//       ...
//     </ul>
//   </details>
//
// A line with no active alerts has no group at all (confirmed against
// railsix.com/lines, whose per-line alertCount matches group presence/size
// here). Bus-route groups and the "Network-wide" station-facility group are
// deliberately not matched — only a group heading matching the line's exact
// display name (e.g. "Lakeshore West") counts as that line's alerts.
// ---------------------------------------------------------------------------
const ALERT_GROUP_RE =
  /<details class="alert-group[^"]*"[^>]*>\s*<summary class="group-head[^"]*">\s*<h2 class="rs-section-heading">([^<]*)<\/h2>\s*<span class="group-count[^"]*">(\d+)<\/span>\s*<\/summary>\s*<ul class="group-list[^"]*">([\s\S]*?)<\/ul>\s*<\/details>/g;

const ALERT_ITEM_RE =
  /<li class="alert-item[^"]*">[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>[\s\S]*?<p class="alert-desc[^"]*">([\s\S]*?)<\/p>[\s\S]*?<\/li>/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function parseRailsixAlertsForLine(html: string, lineName: string): ParsedAlert[] {
  const alerts: ParsedAlert[] = [];

  ALERT_GROUP_RE.lastIndex = 0;
  let groupMatch: RegExpExecArray | null;
  while ((groupMatch = ALERT_GROUP_RE.exec(html)) !== null) {
    if (stripTags(groupMatch[1]) !== lineName) continue;

    const body = groupMatch[3];
    ALERT_ITEM_RE.lastIndex = 0;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = ALERT_ITEM_RE.exec(body)) !== null) {
      const title = stripTags(itemMatch[1]);
      const reason = stripTags(itemMatch[2]);
      alerts.push({
        id: `${lineName}-${alerts.length}`,
        title,
        direction: 'both',
        scheduledDeparture: '',
        scheduledArrival: '',
        status: '',
        reason,
        fromStation: '',
        toStation: '',
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const codeParam = request.nextUrl.searchParams.get('code')?.toUpperCase() ?? '';
  const line = getLine(codeParam);

  try {
    // Try official Go Transit website first
    try {
      const res = await fetch(GOTRANSIT_ALERTS_URL, {
        headers: FETCH_HEADERS,
        next: { revalidate: 60 },
      });

      if (res.ok) {
        const html = await res.text();
        const alerts = parseRailsixAlertsForLine(html, line.name);

        // If we got alerts from official source, return them
        if (alerts.length > 0) {
          return NextResponse.json(
            {
              alerts,
              available: true,
              lastUpdated: new Date().toISOString(),
            },
            { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
          );
        }
      }
    } catch (err) {
      // Fall through to railsix backup if official source fails
      console.warn('Failed to fetch from official Go Transit source, falling back to railsix.com:', err);
    }

    // Fall back to railsix.com
    const res = await fetch(RAILSIX_ALERTS_URL, {
      headers: FETCH_HEADERS,
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { alerts: [], available: false, lastUpdated: null, error: `HTTP ${res.status}` },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
      );
    }

    const html = await res.text();
    const alerts = parseRailsixAlertsForLine(html, line.name);

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
