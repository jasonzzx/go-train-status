import { describe, it, expect } from 'vitest';
import { torontoNow } from './toronto-time';

describe('torontoNow', () => {
  it('converts UTC instants to the Toronto wall clock (EDT)', () => {
    // 15:04:30 UTC = 11:04:30 EDT
    const t = torontoNow(new Date('2026-07-03T15:04:30Z'));
    expect(t).toEqual({ dateStr: '2026-07-03', minutes: 11 * 60 + 4, seconds: 30 });
  });

  it('rolls the date across the Toronto midnight', () => {
    // 03:30 UTC Jul 4 = 23:30 EDT Jul 3
    const t = torontoNow(new Date('2026-07-04T03:30:00Z'));
    expect(t.dateStr).toBe('2026-07-03');
    expect(t.minutes).toBe(23 * 60 + 30);
  });

  it('uses h23 — midnight is minute 0, not 24:00', () => {
    // 05:00 UTC = 00:00 EST in winter
    const t = torontoNow(new Date('2026-01-15T05:00:00Z'));
    expect(t.minutes).toBe(0);
    expect(t.dateStr).toBe('2026-01-15');
  });
});
