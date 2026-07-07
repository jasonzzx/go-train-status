import { describe, it, expect } from 'vitest';
import { watchField, parseWatchEntries, type TripWatch } from './notification-store';
import { EMPTY_SENT } from './notify-rules';

const watch: TripWatch = {
  sub: { endpoint: 'https://push.example/abc', keys: { p256dh: 'k1', auth: 'k2' } },
  tripNumber: '7127',
  lineId: 'ST',
  directionCd: 'Outbound',
  departure: '17:40',
  dest: 'Unionville',
  lang: 'en',
  sent: { ...EMPTY_SENT },
};

describe('watchField', () => {
  it('is deterministic and scoped to (endpoint, trip)', () => {
    const a = watchField('https://push.example/abc', '7127');
    expect(watchField('https://push.example/abc', '7127')).toBe(a);
    expect(watchField('https://push.example/other', '7127')).not.toBe(a);
    expect(watchField('https://push.example/abc', '7128')).not.toBe(a);
  });

  it('ends with the trip number (readable when inspecting the store)', () => {
    expect(watchField('https://push.example/abc', '7127')).toMatch(/^[0-9a-f]{16}:7127$/);
  });
});

describe('parseWatchEntries', () => {
  it('parses an HGETALL flat array', () => {
    const field = watchField(watch.sub.endpoint, watch.tripNumber);
    const parsed = parseWatchEntries([field, JSON.stringify(watch)]);
    expect(parsed).toEqual([{ field, watch }]);
  });

  it('skips corrupt or incomplete entries without dropping good ones', () => {
    const field = watchField(watch.sub.endpoint, watch.tripNumber);
    const parsed = parseWatchEntries([
      'bad:1', 'not json {',
      'bad:2', JSON.stringify({ tripNumber: 'x' }), // no subscription
      field, JSON.stringify(watch),
    ]);
    expect(parsed.map((p) => p.field)).toEqual([field]);
  });

  it('returns [] for empty or non-array replies', () => {
    expect(parseWatchEntries(null)).toEqual([]);
    expect(parseWatchEntries(undefined)).toEqual([]);
    expect(parseWatchEntries([])).toEqual([]);
  });
});
