import { describe, it, expect } from 'vitest';
import {
  timeToMinutes,
  minutesToTime,
  getServiceType,
  tripsForStation,
} from './schedule-data';
import type { GtfsTrip } from './lines';

describe('timeToMinutes', () => {
  it('converts plain times', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('07:05')).toBe(425);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('keeps GTFS after-midnight times on the extended scale', () => {
    expect(timeToMinutes('24:10')).toBe(1450);
    expect(timeToMinutes('25:30')).toBe(1530);
  });
});

describe('minutesToTime', () => {
  it('formats and wraps past midnight', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(425)).toBe('07:05');
    expect(minutesToTime(1450)).toBe('00:10'); // 24:10 wraps to next day
    expect(minutesToTime(-10)).toBe('23:50');
  });
});

describe('getServiceType', () => {
  it('maps days of week to GO service types', () => {
    expect(getServiceType(new Date(2026, 6, 3))).toBe('weekday'); // Fri
    expect(getServiceType(new Date(2026, 6, 4))).toBe('saturday');
    expect(getServiceType(new Date(2026, 6, 5))).toBe('sunday');
    expect(getServiceType(new Date(2026, 6, 6))).toBe('weekday'); // Mon
  });
});

describe('tripsForStation', () => {
  const trip = (tripId: string, stopTimes: Record<string, string>, vehicleType: 'train' | 'bus' = 'train'): GtfsTrip => ({
    tripId,
    vehicleType,
    stopTimes,
  });

  const dayTrips: GtfsTrip[] = [
    // Full-line trip: Mount Joy → Unionville → Union
    trip('20260703-ST-7101', { MJ: '07:00', UI: '07:15', UN: '07:55' }),
    // Short-turn trip that starts at Unionville EARLIER than the previous
    // trip reaches it — output must be re-sorted by this station's time.
    trip('20260703-ST-7099', { UI: '07:05', UN: '07:45' }),
    // Trip that does not serve Unionville — filtered out for UI.
    trip('20260703-ST-7103', { MJ: '08:00', UN: '08:55' }),
    // Trip with no Union stop at all — always filtered out.
    trip('20260703-ST-9999', { MJ: '09:00', UI: '09:15' }),
  ];

  it('filters to trips serving both the station and Union', () => {
    const trips = tripsForStation(dayTrips, 'homeToOffice', 'UI');
    expect(trips.map((t) => t.tripId)).toEqual(['20260703-ST-7099', '20260703-ST-7101']);
  });

  it('sorts by the station departure, not trip origin order', () => {
    const trips = tripsForStation(dayTrips, 'homeToOffice', 'UI');
    expect(trips[0].departure).toBe('07:05');
    expect(trips[1].departure).toBe('07:15');
  });

  it('uses station→Union times for homeToOffice', () => {
    const [first] = tripsForStation(dayTrips, 'homeToOffice', 'UI');
    expect(first.departure).toBe('07:05');
    expect(first.arrival).toBe('07:45');
    expect(first.tripTime).toBe('40 min');
  });

  it('uses Union→station times for officeToHome', () => {
    const [first] = tripsForStation(
      [trip('20260703-ST-7202', { UN: '17:10', UI: '17:50', MJ: '18:05' })],
      'officeToHome',
      'UI',
    );
    expect(first.departure).toBe('17:10');
    expect(first.arrival).toBe('17:50');
  });

  it('computes trip time across midnight', () => {
    const [first] = tripsForStation(
      [trip('20260703-ST-7300', { UN: '23:50', UI: '24:30' })],
      'officeToHome',
      'UI',
    );
    expect(first.tripTime).toBe('40 min');
  });
});
