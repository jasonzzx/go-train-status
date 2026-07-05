import { describe, it, expect } from 'vitest';
import { buildTrackerMaps, getTrackerInfo, formatPlatformLabel } from './tracker-info';
import type { TrackerTrip } from '@/app/api/tracker/route';

function trackerTrip(overrides: Partial<TrackerTrip>): TrackerTrip {
  return {
    scheduledTime: '08:00',
    directionCd: 'Inbound',
    platform: '',
    expected: '08:00',
    delay: 0,
    cancelled: false,
    arriveIn: '',
    ...overrides,
  } as TrackerTrip;
}

describe('buildTrackerMaps', () => {
  it('splits trips into inbound/outbound maps keyed by scheduledTime', () => {
    const { inbound, outbound } = buildTrackerMaps([
      trackerTrip({ scheduledTime: '08:00', directionCd: 'Inbound', platform: '3' }),
      trackerTrip({ scheduledTime: '17:10', directionCd: 'Outbound', platform: '12' }),
    ]);
    expect(inbound.get('08:00')?.platform).toBe('3');
    expect(outbound.get('17:10')?.platform).toBe('12');
    expect(inbound.has('17:10')).toBe(false);
    expect(outbound.has('08:00')).toBe(false);
  });

  it('carries delay/cancelled/expected/arriveIn through', () => {
    const { inbound } = buildTrackerMaps([
      trackerTrip({ scheduledTime: '08:00', delay: 7, cancelled: true, expected: '08:07', arriveIn: '12 min' }),
    ]);
    expect(inbound.get('08:00')).toEqual({
      platform: '',
      expected: '08:07',
      delay: 7,
      cancelled: true,
      arriveIn: '12 min',
    });
  });
});

describe('getTrackerInfo', () => {
  const { inbound, outbound } = buildTrackerMaps([
    trackerTrip({ scheduledTime: '08:00', directionCd: 'Inbound', platform: '3' }),
    trackerTrip({ scheduledTime: '17:10', directionCd: 'Outbound', platform: '12' }),
  ]);

  it('homeToOffice matches the inbound map by departure time', () => {
    const info = getTrackerInfo({ departure: '08:00', arrival: '08:45' }, 'homeToOffice', inbound, outbound);
    expect(info?.platform).toBe('3');
  });

  it('officeToHome matches the outbound map by departure time', () => {
    const info = getTrackerInfo({ departure: '17:10', arrival: '17:55' }, 'officeToHome', inbound, outbound);
    expect(info?.platform).toBe('12');
  });

  it('returns null when the trip has no tracker entry', () => {
    expect(getTrackerInfo({ departure: '09:00', arrival: '09:45' }, 'homeToOffice', inbound, outbound)).toBeNull();
    // Wrong direction must not cross-match.
    expect(getTrackerInfo({ departure: '17:10', arrival: '17:55' }, 'homeToOffice', inbound, outbound)).toBeNull();
  });
});

describe('formatPlatformLabel', () => {
  it('joins Metrolinx "&" pairs with a pipe', () => {
    expect(formatPlatformLabel('7 & 8')).toBe('7 | 8');
  });

  it('accepts comma and slash separators too', () => {
    expect(formatPlatformLabel('7,8')).toBe('7 | 8');
    expect(formatPlatformLabel('7/8')).toBe('7 | 8');
  });

  it('passes single platforms through and drops empty pieces', () => {
    expect(formatPlatformLabel('12')).toBe('12');
    expect(formatPlatformLabel(' 7 & ')).toBe('7');
    expect(formatPlatformLabel('')).toBe('');
  });
});
