import { describe, it, expect } from 'vitest';
import { computeLineStatus } from './line-status';
import type { Trip } from '@/lib/schedule-data';
import type { TrackerTrip } from '@/app/api/tracker/route';

const trip = { departure: '08:00', arrival: '08:45', tripTime: '45', vehicleType: 'train' } as Trip;

function trackerTrip(overrides: Partial<TrackerTrip>): TrackerTrip {
  return { delay: 0, cancelled: false, ...overrides } as TrackerTrip;
}

describe('computeLineStatus', () => {
  it('no trips → noService', () => {
    expect(computeLineStatus([], [])).toBe('noService');
    expect(computeLineStatus([], [trackerTrip({ delay: 10 })])).toBe('noService');
  });

  it('trips with clean tracker → good', () => {
    expect(computeLineStatus([trip], [])).toBe('good');
    expect(computeLineStatus([trip], [trackerTrip({})])).toBe('good');
  });

  it('any delayed or cancelled tracker trip → minor', () => {
    expect(computeLineStatus([trip], [trackerTrip({ delay: 5 })])).toBe('minor');
    expect(computeLineStatus([trip], [trackerTrip({ cancelled: true })])).toBe('minor');
    expect(computeLineStatus([trip], [trackerTrip({}), trackerTrip({ delay: 1 })])).toBe('minor');
  });
});
