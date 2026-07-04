// ── Toronto wall-clock helper (client-safe) ─────────────────────────────────
// Every GO schedule time in this app is America/Toronto. The server routes
// already evaluate "now" in that zone; the UI must too, or a user whose
// device clock is in another timezone (travel, wrong settings) gets the
// wrong "today", NEXT highlighting, and departure countdown.

export interface TorontoNow {
  /** Calendar date "YYYY-MM-DD" in America/Toronto. */
  dateStr: string;
  /** Minutes since midnight (0–1439), America/Toronto. */
  minutes: number;
  /** Seconds within the current minute (0–59). */
  seconds: number;
}

const FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function torontoNow(now: Date = new Date()): TorontoNow {
  const parts = FORMATTER.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    seconds: Number(get('second')),
  };
}
