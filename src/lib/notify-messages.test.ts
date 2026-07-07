import { describe, it, expect } from 'vitest';
import { buildPushPayload } from './notify-messages';
import { EMPTY_SENT, type NotifyEvent } from './notify-rules';
import type { TripWatch } from './notification-store';

const watch = (over: Partial<TripWatch> = {}): TripWatch => ({
  sub: { endpoint: 'https://push.example/abc', keys: { p256dh: 'k1', auth: 'k2' } },
  tripNumber: '7127',
  lineId: 'ST',
  directionCd: 'Outbound',
  departure: '17:40',
  dest: 'Unionville',
  lang: 'en',
  sent: { ...EMPTY_SENT },
  ...over,
});

const ev = (over: Partial<NotifyEvent>): NotifyEvent => ({
  type: 'delayed',
  delayMin: 0,
  platform: '',
  ...over,
});

describe('buildPushPayload', () => {
  it('interpolates departure/dest/min into a delay message', () => {
    const p = buildPushPayload(ev({ type: 'delayed', delayMin: 8 }), watch());
    expect(p.title).toBe('17:40 → Unionville: delayed 8 min');
    expect(p.body).toContain('8 min late');
  });

  it('builds platform messages with the platform value', () => {
    const p = buildPushPayload(ev({ type: 'platform', platform: '12, 13' }), watch());
    expect(p.title).toBe('17:40 → Unionville: Platform 12, 13');
    expect(p.body).toContain('12, 13');
  });

  it('translates by the watch language', () => {
    const p = buildPushPayload(ev({ type: 'cancelled' }), watch({ lang: 'zh', dest: '于人村' }));
    expect(p.title).toBe('17:40 → 于人村：已取消');
  });

  it('shares a tag between delayed and recovered so the all-clear replaces the delay', () => {
    const delayed = buildPushPayload(ev({ type: 'delayed', delayMin: 8 }), watch());
    const recovered = buildPushPayload(ev({ type: 'recovered' }), watch());
    expect(recovered.tag).toBe(delayed.tag);
    const platform = buildPushPayload(ev({ type: 'platform', platform: '9' }), watch());
    expect(platform.tag).not.toBe(delayed.tag);
  });
});
