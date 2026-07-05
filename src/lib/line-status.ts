// ── Overall line status ──────────────────────────────────────────────────────
// Mirrors gotransit.com's status badge:
// "Good Service" / "Minor Delays" / "No Scheduled Service Today"

import type { Trip } from '@/lib/schedule-data';
import type { TrackerTrip } from '@/app/api/tracker/route';

export type LineStatus = 'good' | 'minor' | 'noService';

export function computeLineStatus(trips: Trip[], trackerTrips: TrackerTrip[]): LineStatus {
  if (trips.length === 0) return 'noService';
  if (trackerTrips.some((t) => t.cancelled || t.delay > 0)) return 'minor';
  return 'good';
}
