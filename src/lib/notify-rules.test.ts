import { describe, it, expect } from 'vitest';
import {
  decideNotifications,
  applySentEvent,
  watchExpired,
  EMPTY_SENT,
  DELAY_NOTIFY_MIN,
  DELAY_GROWTH_MIN,
  WATCH_EXPIRY_MIN,
  type LiveSnapshot,
  type WatchSentState,
} from './notify-rules';

const live = (over: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
  delayMin: 0,
  cancelled: false,
  platform: '',
  hasLive: true,
  ...over,
});

const sent = (over: Partial<WatchSentState> = {}): WatchSentState => ({
  ...EMPTY_SENT,
  ...over,
});

const union = { unionDeparture: true };
const home = { unionDeparture: false };

describe('decideNotifications — delay', () => {
  it('stays quiet below the threshold', () => {
    const { events } = decideNotifications(sent(), live({ delayMin: DELAY_NOTIFY_MIN - 1 }), home);
    expect(events).toEqual([]);
  });

  it('notifies once the delay reaches the threshold', () => {
    const { events, next } = decideNotifications(sent(), live({ delayMin: 7 }), home);
    expect(events).toEqual([{ type: 'delayed', delayMin: 7, platform: '' }]);
    expect(next.delayMin).toBe(7);
  });

  it('does not repeat for the same (or slightly changed) delay', () => {
    expect(decideNotifications(sent({ delayMin: 7 }), live({ delayMin: 7 }), home).events).toEqual([]);
    expect(decideNotifications(sent({ delayMin: 7 }), live({ delayMin: 12 }), home).events).toEqual([]);
  });

  it('re-notifies when the delay grows by the growth step', () => {
    const { events, next } = decideNotifications(
      sent({ delayMin: 7 }),
      live({ delayMin: 7 + DELAY_GROWTH_MIN }),
      home,
    );
    expect(events).toEqual([{ type: 'delayed', delayMin: 17, platform: '' }]);
    expect(next.delayMin).toBe(17);
  });

  it('sends an all-clear when a notified delay recovers', () => {
    const { events, next } = decideNotifications(sent({ delayMin: 7 }), live({ delayMin: 2 }), home);
    expect(events).toEqual([{ type: 'recovered', delayMin: 2, platform: '' }]);
    expect(next.delayMin).toBe(0);
  });

  it('does NOT send an all-clear when the trip merely drops out of the live feed', () => {
    const { events, next } = decideNotifications(
      sent({ delayMin: 7 }),
      live({ delayMin: 0, hasLive: false }),
      home,
    );
    expect(events).toEqual([]);
    expect(next.delayMin).toBe(7);
  });

  it('can re-notify a fresh delay after a recovery', () => {
    const afterRecovery = decideNotifications(sent({ delayMin: 7 }), live({ delayMin: 0 }), home).next;
    const { events } = decideNotifications(afterRecovery, live({ delayMin: 6 }), home);
    expect(events).toEqual([{ type: 'delayed', delayMin: 6, platform: '' }]);
  });
});

describe('decideNotifications — cancellation', () => {
  it('notifies a cancellation once and then stays silent', () => {
    const first = decideNotifications(sent(), live({ cancelled: true }), union);
    expect(first.events).toEqual([{ type: 'cancelled', delayMin: 0, platform: '' }]);
    expect(first.next.cancelled).toBe(true);

    const second = decideNotifications(first.next, live({ cancelled: true, platform: '9' }), union);
    expect(second.events).toEqual([]);
  });

  it('suppresses delay/platform events on the cancellation itself', () => {
    const { events } = decideNotifications(
      sent(),
      live({ cancelled: true, delayMin: 20, platform: '9' }),
      union,
    );
    expect(events.map((e) => e.type)).toEqual(['cancelled']);
  });
});

describe('decideNotifications — platform', () => {
  it('notifies the first Union platform assignment', () => {
    const { events, next } = decideNotifications(sent(), live({ platform: '9' }), union);
    expect(events).toEqual([{ type: 'platform', delayMin: 0, platform: '9' }]);
    expect(next.platform).toBe('9');
  });

  it('notifies again only when the platform changes', () => {
    expect(decideNotifications(sent({ platform: '9' }), live({ platform: '9' }), union).events).toEqual([]);
    const { events } = decideNotifications(sent({ platform: '9' }), live({ platform: '12, 13' }), union);
    expect(events).toEqual([{ type: 'platform', delayMin: 0, platform: '12, 13' }]);
  });

  it('never fires for home-station (Inbound) departures', () => {
    const { events } = decideNotifications(sent(), live({ platform: '2' }), home);
    expect(events).toEqual([]);
  });

  it('can pair with a delay event in one run', () => {
    const { events } = decideNotifications(sent(), live({ delayMin: 8, platform: '9' }), union);
    expect(events.map((e) => e.type)).toEqual(['delayed', 'platform']);
  });
});

describe('applySentEvent', () => {
  it('folds each event type into the sent state', () => {
    let s = sent();
    s = applySentEvent(s, { type: 'delayed', delayMin: 9, platform: '' });
    expect(s.delayMin).toBe(9);
    s = applySentEvent(s, { type: 'platform', delayMin: 9, platform: '9' });
    expect(s.platform).toBe('9');
    s = applySentEvent(s, { type: 'recovered', delayMin: 0, platform: '' });
    expect(s.delayMin).toBe(0);
    s = applySentEvent(s, { type: 'cancelled', delayMin: 0, platform: '' });
    expect(s.cancelled).toBe(true);
  });

  it('matches decideNotifications.next when every event is applied', () => {
    const { events, next } = decideNotifications(sent(), live({ delayMin: 8, platform: '9' }), union);
    expect(events.reduce(applySentEvent, sent())).toEqual(next);
  });
});

describe('watchExpired', () => {
  it('keeps a watch before and shortly after departure', () => {
    expect(watchExpired('17:40', 0, 17 * 60)).toBe(false); // 17:00, not departed
    expect(watchExpired('17:40', 0, 17 * 60 + 40 + 30)).toBe(false); // 30 min after
  });

  it('expires a watch well after departure', () => {
    expect(watchExpired('17:40', 0, 17 * 60 + 40 + WATCH_EXPIRY_MIN + 1)).toBe(true);
  });

  it('extends the window by the known delay', () => {
    const justPastScheduledWindow = 17 * 60 + 40 + WATCH_EXPIRY_MIN + 5;
    expect(watchExpired('17:40', 20, justPastScheduledWindow)).toBe(false);
  });

  it('handles the past-midnight wrap (evening departure, early-morning now)', () => {
    // 23:50 departure checked at 00:30 → 40 min after departure, keep.
    expect(watchExpired('23:50', 0, 30)).toBe(false);
    // …and at 02:00 → 130 min after, expire.
    expect(watchExpired('23:50', 0, 120)).toBe(true);
  });

  it('drops malformed departures', () => {
    expect(watchExpired('', 0, 600)).toBe(true);
    expect(watchExpired('bogus', 0, 600)).toBe(true);
  });
});
