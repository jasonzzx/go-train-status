import { describe, it, expect } from 'vitest';
import { tripHasStarted, tripNumberFromId } from './trains';

describe('tripHasStarted', () => {
  it('is true once now reaches the scheduled start', () => {
    expect(tripHasStarted('08:00', 8 * 60)).toBe(true);
    expect(tripHasStarted('08:00', 8 * 60 + 30)).toBe(true);
  });

  it('is false while the trainset is pre-positioned before departure', () => {
    // 07:20 now, 08:00 start — DelaySeconds would be a countdown, not a delay.
    expect(tripHasStarted('08:00', 7 * 60 + 20)).toBe(false);
  });

  it('treats a past-midnight wrap as started', () => {
    // Start 23:50 yesterday, now 00:10 — gap > 12h means we wrapped.
    expect(tripHasStarted('23:50', 10)).toBe(true);
  });

  it('does not suppress a signal when StartTime is missing or malformed', () => {
    expect(tripHasStarted(undefined, 0)).toBe(true);
    expect(tripHasStarted('', 0)).toBe(true);
    expect(tripHasStarted('n/a', 0)).toBe(true);
  });
});

describe('tripNumberFromId', () => {
  it('extracts the trip number from a GTFS trip_id', () => {
    expect(tripNumberFromId('20260616-ST-7127')).toBe('7127');
    expect(tripNumberFromId('20260701-GT-3706')).toBe('3706');
  });
});
