// ── Alert matching ───────────────────────────────────────────────────────────
// Groups parsed service alerts by their scheduled departure time so each
// train card can show only the alerts for its own trip and direction.

import type { Direction } from '@/lib/schedule-data';
import type { ParsedAlert } from '@/app/api/alerts/route';

export function buildAlertMap(alerts: ParsedAlert[], direction: Direction): Map<string, ParsedAlert[]> {
  const map = new Map<string, ParsedAlert[]>();
  for (const alert of alerts) {
    if (!alert.scheduledDeparture) continue;
    if (alert.direction !== 'both') {
      const expected = direction === 'officeToHome' ? 'northbound' : 'southbound';
      if (alert.direction !== expected) continue;
    }
    const key = alert.scheduledDeparture;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(alert);
  }
  return map;
}
