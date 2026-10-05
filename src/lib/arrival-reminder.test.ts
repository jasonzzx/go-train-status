import { describe, expect, it } from 'vitest';
import {
  expectedArrivalAt, reminderDue, reminderId, scheduledArrivalAt, serviceTimeAt,
  validLead, type ArrivalReminder,
} from './arrival-reminder';

function reminder(overrides: Partial<ArrivalReminder> = {}): ArrivalReminder {
  const base: ArrivalReminder = {
    id: '', token: '7b0ab8c8-5bb0-4d88-a400-102030405060',
    deviceId: 'a7ed1351-d5c9-4e7d-a7b8-102030405060',
    serviceDate: '2026-10-04', lineId: 'ST', direction: 'officeToHome',
    tripNumber: '7422', scheduledDeparture: '17:20', homeStationCode: 'UI',
    destinationCode: 'UI', destinationName: 'Unionville GO',
    scheduledArrival: '18:00', scheduledArrivalAt: serviceTimeAt('2026-10-04', '18:00'),
    delayMin: 10, leadMin: 2, enabled: true, lang: 'en', sent: false,
  };
  return { ...base, ...overrides, id: reminderId({ ...base, ...overrides }) };
}

describe('arrival reminder timing', () => {
  it('follows a live delay and moves the alert earlier when the delay recovers', () => {
    const active = reminder();
    expect(new Date(expectedArrivalAt(active)).toISOString()).toBe('2026-10-04T22:10:00.000Z');
    expect(reminderDue(active, serviceTimeAt('2026-10-04', '18:07'))).toBe(false);
    expect(reminderDue(active, serviceTimeAt('2026-10-04', '18:08'))).toBe(true);
    expect(reminderDue({ ...active, delayMin: 3 }, serviceTimeAt('2026-10-04', '18:02'))).toBe(true);
    expect(reminderDue({ ...active, delayMin: 3, sent: true }, serviceTimeAt('2026-10-04', '18:02'))).toBe(false);
    expect(reminderDue({ ...active, enabled: false }, serviceTimeAt('2026-10-04', '18:08'))).toBe(false);
    expect(reminderDue(active, serviceTimeAt('2026-10-04', '18:10'))).toBe(false);
  });

  it('limits the preference to 1–5 minutes and defaults to 2', () => {
    for (const lead of [1, 2, 3, 4, 5]) expect(validLead(lead)).toBe(lead);
    for (const lead of [0, 6, 'garbage']) expect(validLead(lead)).toBe(2);
  });

  it('ties the journey to destination and service day, regardless of GTFS source date', () => {
    expect(reminder({ destinationCode: 'UN' }).id).not.toBe(reminder().id);
    expect(reminder({ serviceDate: '2026-10-05' }).id).not.toBe(reminder().id);
  });

  it('resolves an overnight destination arrival on the next Toronto day', () => {
    const arrival = scheduledArrivalAt('2026-10-04', { departure: '23:50', arrival: '00:30' });
    expect(arrival).toBe(serviceTimeAt('2026-10-04', '24:30'));
  });

  it('uses Toronto daylight-saving offsets across both clock changes', () => {
    expect(serviceTimeAt('2026-03-08', '03:30')).toBe(Date.parse('2026-03-08T07:30:00Z'));
    expect(serviceTimeAt('2026-11-01', '02:30')).toBe(Date.parse('2026-11-01T07:30:00Z'));
  });
});
