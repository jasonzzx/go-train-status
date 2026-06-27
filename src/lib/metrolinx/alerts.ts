// ── Service alert wrapper (ServiceUpdate/ServiceAlert) ─────────────────────
// Returns alerts for a given line, mapped to the app's ParsedAlert contract.
//
// UNVERIFIED mapping — field names come from the go_transit_ruby wrapper, not a
// live payload. See docs/api-migration-plan.md.

import { fetchJson, listFrom, toArray } from './client';
import type { RawAlertMessage, RawAlertLine } from './types';

// Alerts change slowly; the client polls every 5 min.
const ALERTS_TTL_MS = 60_000;

/** All current service-alert messages across the network. */
export async function getServiceAlerts(): Promise<RawAlertMessage[]> {
  const data = await fetchJson<unknown>('ServiceUpdate/ServiceAlert/All', ALERTS_TTL_MS);
  return listFrom<RawAlertMessage>(data, 'Messages', 'Message');
}

function lineCodesOf(msg: RawAlertMessage): string[] {
  return toArray<RawAlertLine>((msg.Lines as Record<string, unknown> | undefined)?.['Line'])
    .map((l) => l.Code)
    .filter((c): c is string => Boolean(c));
}

/** ParsedAlert as consumed by page.tsx (kept in sync with /api/alerts). */
export interface OfficialAlert {
  id: string;
  title: string;
  direction: 'northbound' | 'southbound' | 'both';
  scheduledDeparture: string;
  scheduledArrival: string;
  status: string;
  reason: string;
  fromStation: string;
  toStation: string;
}

/** Fetch service alerts and return only those affecting `lineCode`. */
export async function getServiceAlertsForLine(lineCode: string): Promise<OfficialAlert[]> {
  const messages = await getServiceAlerts();
  const alerts: OfficialAlert[] = [];

  for (const msg of messages) {
    const codes = lineCodesOf(msg);
    if (!codes.includes(lineCode)) continue;

    const title = (msg.SubjectEnglish ?? '').trim();
    const reason = (msg.BodyEnglish ?? '').trim();
    if (!title && !reason) continue;

    alerts.push({
      id: msg.Code ?? `${lineCode}-${alerts.length}`,
      title: title || reason,
      direction: 'both',
      scheduledDeparture: '',
      scheduledArrival: '',
      status: msg.Status ?? '',
      reason,
      fromStation: '',
      toStation: '',
    });
  }

  return alerts;
}
