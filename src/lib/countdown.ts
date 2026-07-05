// ── Departure countdown helpers (client-safe) ───────────────────────────────
// Pure time math for the NEXT card's live countdown chip and the platform
// sheet's leave-by display. All "now" comes from the Toronto wall clock.

import { timeToMinutes } from '@/lib/schedule-data';
import { torontoNow } from '@/lib/toronto-time';

/** Seconds from now (Toronto clock) until today's expected departure (scheduled + live delay). */
export function secondsUntilDeparture(departure: string, delayMin: number): number {
  const now = torontoNow();
  const targetSec = (timeToMinutes(departure) + delayMin) * 60;
  return Math.max(0, targetSec - (now.minutes * 60 + now.seconds));
}

export function formatCountdown(totalSeconds: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Countdown urgency rule — adjust the cutoffs here:
//   remaining >  COUNTDOWN_WARN_MINUTES   → 'calm'   (green, the default look)
//   COUNTDOWN_URGENT_MINUTES … WARN       → 'warn'   (yellow — get moving)
//   remaining <  COUNTDOWN_URGENT_MINUTES → 'urgent' (red — doors close ~1 min early)
export const COUNTDOWN_WARN_MINUTES = 10;
export const COUNTDOWN_URGENT_MINUTES = 3;

export type CountdownTone = 'calm' | 'warn' | 'urgent';

export function countdownTone(secondsLeft: number): CountdownTone {
  if (secondsLeft < COUNTDOWN_URGENT_MINUTES * 60) return 'urgent';
  if (secondsLeft <= COUNTDOWN_WARN_MINUTES * 60) return 'warn';
  return 'calm';
}

/** Minutes-since-midnight → "HH:MM", wrapping past-midnight and negative values. */
export function formatMinutesAsHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
