import { describe, it, expect } from 'vitest';
import { toGtfsTime } from './schedule';

describe('toGtfsTime', () => {
  const day = '20260703';

  it('passes through same-day times', () => {
    expect(toGtfsTime('2026-07-03 07:15:00', day)).toBe('07:15');
    expect(toGtfsTime('2026-07-03 23:59:00', day)).toBe('23:59');
  });

  it('converts next-day stops to the GTFS 24:xx convention', () => {
    expect(toGtfsTime('2026-07-04 01:10:00', day)).toBe('25:10');
    expect(toGtfsTime('2026-07-04 00:05:00', day)).toBe('24:05');
  });

  it('handles month/year boundaries', () => {
    expect(toGtfsTime('2026-08-01 00:30:00', '20260731')).toBe('24:30');
    expect(toGtfsTime('2027-01-01 00:30:00', '20261231')).toBe('24:30');
  });

  it('rejects malformed or out-of-range input', () => {
    expect(toGtfsTime(undefined, day)).toBeNull();
    expect(toGtfsTime('', day)).toBeNull();
    expect(toGtfsTime('garbage', day)).toBeNull();
    // Two days out (>47h) is outside the GTFS extended range.
    expect(toGtfsTime('2026-07-05 01:00:00', day)).toBeNull();
    // A stop dated BEFORE the service date would go negative.
    expect(toGtfsTime('2026-07-02 23:00:00', day)).toBeNull();
  });
});
