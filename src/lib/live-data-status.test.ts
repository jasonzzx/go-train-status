import { describe, expect, it } from 'vitest';
import { getLiveDataStatus } from './live-data-status';

const NOW = new Date('2026-07-06T13:00:00.000Z');

describe('getLiveDataStatus', () => {
  it('uses schedule-only status for dates other than today', () => {
    expect(getLiveDataStatus({
      isToday: false,
      requestState: 'available',
      lastUpdated: NOW,
      now: NOW,
    })).toEqual({ state: 'scheduleOnly', ageSeconds: null });
  });

  it('distinguishes the initial load from an unavailable live feed', () => {
    expect(getLiveDataStatus({
      isToday: true,
      requestState: 'loading',
      lastUpdated: null,
      now: NOW,
    }).state).toBe('loading');
    expect(getLiveDataStatus({
      isToday: true,
      requestState: 'unavailable',
      lastUpdated: null,
      now: NOW,
    }).state).toBe('unavailable');
  });

  it('reports the age of a fresh live response', () => {
    expect(getLiveDataStatus({
      isToday: true,
      requestState: 'available',
      lastUpdated: new Date(NOW.getTime() - 20_000),
      now: NOW,
    })).toEqual({ state: 'fresh', ageSeconds: 20 });
  });

  it('marks old data and data retained after a failed refresh as stale', () => {
    expect(getLiveDataStatus({
      isToday: true,
      requestState: 'available',
      lastUpdated: new Date(NOW.getTime() - 91_000),
      now: NOW,
    }).state).toBe('stale');
    expect(getLiveDataStatus({
      isToday: true,
      requestState: 'unavailable',
      lastUpdated: new Date(NOW.getTime() - 10_000),
      now: NOW,
    }).state).toBe('stale');
  });
});
