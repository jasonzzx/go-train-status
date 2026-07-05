import { describe, it, expect } from 'vitest';
import { buildAlertMap } from './alert-match';
import type { ParsedAlert } from '@/app/api/alerts/route';

function alert(overrides: Partial<ParsedAlert>): ParsedAlert {
  return {
    title: 'Delay',
    direction: 'both',
    scheduledDeparture: '08:00',
    ...overrides,
  } as ParsedAlert;
}

describe('buildAlertMap', () => {
  it('groups alerts by scheduled departure', () => {
    const map = buildAlertMap(
      [alert({ scheduledDeparture: '08:00' }), alert({ scheduledDeparture: '08:00' }), alert({ scheduledDeparture: '09:15' })],
      'homeToOffice'
    );
    expect(map.get('08:00')).toHaveLength(2);
    expect(map.get('09:15')).toHaveLength(1);
  });

  it('drops alerts without a scheduled departure', () => {
    const map = buildAlertMap([alert({ scheduledDeparture: undefined })], 'homeToOffice');
    expect(map.size).toBe(0);
  });

  it('homeToOffice keeps southbound and both, drops northbound', () => {
    const map = buildAlertMap(
      [alert({ direction: 'southbound' }), alert({ direction: 'both' }), alert({ direction: 'northbound' })],
      'homeToOffice'
    );
    expect(map.get('08:00')).toHaveLength(2);
  });

  it('officeToHome keeps northbound and both, drops southbound', () => {
    const map = buildAlertMap(
      [alert({ direction: 'southbound' }), alert({ direction: 'both' }), alert({ direction: 'northbound' })],
      'officeToHome'
    );
    expect(map.get('08:00')).toHaveLength(2);
  });
});
