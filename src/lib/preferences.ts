// ── Persisted trip preferences (client-only) ────────────────────────────────
// The selected line and per-line home station live in localStorage. These
// loaders validate stored values against the current line data and migrate
// legacy station codes, so a stale bookmark never selects a nonexistent stop.

import { LINES, DEFAULT_LINE_ID, type LineInfo } from '@/lib/lines';

export const LINE_STORAGE_KEY = 'go-train-line';
export const HOME_STATION_STORAGE_KEY = 'go-train-home-station';

// Home station is remembered per line: "go-train-home-station:LW".
// The un-suffixed key is the legacy Stouffville-only key (pre multi-line).
export function homeStationKey(lineId: string): string {
  return `${HOME_STATION_STORAGE_KEY}:${lineId}`;
}

// Resolve the saved (or default) home station for a line, validating it against
// the line's stations and migrating pre-GTFS Stouffville codes.
// These read localStorage and so must only ever run client-side, after
// mount — never as a useState lazy initializer, or the client's first
// render (during hydration) won't match the server-rendered default and
// React will throw a hydration mismatch.
export function loadHomeStation(line: LineInfo): string {
  let stored = localStorage.getItem(homeStationKey(line.id));
  if (!stored && line.id === 'ST') stored = localStorage.getItem(HOME_STATION_STORAGE_KEY);
  const migration: Record<string, string> = { OE: 'LI', ER: 'ST', ML: 'MK', AO: 'AG', CN: 'CE', MK: 'MR' };
  const code = stored ? (migration[stored] ?? stored) : line.defaultHomeCode;
  return line.homeStations.some((s) => s.code === code) ? code : line.defaultHomeCode;
}

export function loadLineId(): string {
  const stored = localStorage.getItem(LINE_STORAGE_KEY) ?? DEFAULT_LINE_ID;
  return LINES.some((l) => l.id === stored) ? stored : DEFAULT_LINE_ID;
}
