// ── Push-notification decision rules (pure) ─────────────────────────────────
// Given what we already notified a watcher about (sent state, stored with the
// watch) and the trip's current live snapshot, decide which notifications are
// due now. Pure and side-effect free so the cron route stays a thin shell and
// the thresholds/edge cases live under unit tests.

/** First delay notification fires when the live delay reaches this. */
export const DELAY_NOTIFY_MIN = 5;
/** A follow-up "delay grew" notification fires when it grows by this much. */
export const DELAY_GROWTH_MIN = 10;
/** A watch is dropped this long after its expected departure has passed. */
export const WATCH_EXPIRY_MIN = 90;

export type NotifyEventType = 'delayed' | 'recovered' | 'cancelled' | 'platform';

export interface NotifyEvent {
  type: NotifyEventType;
  /** Live delay in minutes (delayed/recovered events). */
  delayMin: number;
  /** Newly published platform (platform events). */
  platform: string;
}

/** What this watch has already been notified about. */
export interface WatchSentState {
  /** Delay we last notified (0 = no delay notification sent / recovered). */
  delayMin: number;
  cancelled: boolean;
  /** Platform we last notified ("" = none yet). */
  platform: string;
}

/** The trip's current live signals (subset of LiveTrainStatus). */
export interface LiveSnapshot {
  delayMin: number;
  cancelled: boolean;
  platform: string;
  /** False when the trip has no live signal at all right now. */
  hasLive: boolean;
}

export const EMPTY_SENT: WatchSentState = { delayMin: 0, cancelled: false, platform: '' };

/**
 * Fold one successfully-delivered event into the sent state. The cron applies
 * this per event only after the push service accepts it, so a transiently
 * failed send is retried on the next run instead of being lost.
 */
export function applySentEvent(sent: WatchSentState, event: NotifyEvent): WatchSentState {
  switch (event.type) {
    case 'delayed':
      return { ...sent, delayMin: event.delayMin };
    case 'recovered':
      return { ...sent, delayMin: 0 };
    case 'cancelled':
      return { ...sent, cancelled: true };
    case 'platform':
      return { ...sent, platform: event.platform };
  }
}

/**
 * Decide which notifications are due and the sent state to store back.
 *
 * `unionDeparture` gates platform events: only Union (Outbound) platforms are
 * announced ~10-15 min out — that's the "stop huddling at the departure board"
 * moment. Home-station platforms are scheduled and known all day, so pushing
 * them would be noise.
 */
export function decideNotifications(
  sent: WatchSentState,
  live: LiveSnapshot,
  opts: { unionDeparture: boolean },
): { events: NotifyEvent[]; next: WatchSentState } {
  const events: NotifyEvent[] = [];

  // Cancellation is terminal: notify once, then stay quiet — delay/platform
  // updates for a cancelled trip would only confuse.
  if (sent.cancelled) return { events, next: { ...sent } };
  if (live.cancelled) {
    events.push({ type: 'cancelled', delayMin: live.delayMin, platform: '' });
    return { events, next: applySentEvent(sent, events[0]) };
  }

  // Delay: first notification at the threshold, follow-up when it grows
  // significantly, and an all-clear when it recovers. Recovery requires a live
  // signal — a delayed train that simply drops out of the feed (departed,
  // feed hiccup) must not produce a bogus "back on time".
  if (sent.delayMin === 0 && live.delayMin >= DELAY_NOTIFY_MIN) {
    events.push({ type: 'delayed', delayMin: live.delayMin, platform: '' });
  } else if (sent.delayMin > 0 && live.delayMin >= sent.delayMin + DELAY_GROWTH_MIN) {
    events.push({ type: 'delayed', delayMin: live.delayMin, platform: '' });
  } else if (sent.delayMin >= DELAY_NOTIFY_MIN && live.hasLive && live.delayMin < DELAY_NOTIFY_MIN) {
    events.push({ type: 'recovered', delayMin: live.delayMin, platform: '' });
  }

  // Platform: first assignment and any change, Union departures only.
  if (opts.unionDeparture && live.platform && live.platform !== sent.platform) {
    events.push({ type: 'platform', delayMin: live.delayMin, platform: live.platform });
  }

  return { events, next: events.reduce(applySentEvent, sent) };
}

/**
 * True once the watch is no longer worth keeping: its expected departure
 * (scheduled + last-known delay) passed more than WATCH_EXPIRY_MIN ago.
 * Handles the past-midnight wrap the same way tripHasStarted does.
 */
export function watchExpired(
  departure: string,
  delayMin: number,
  nowMinutes: number,
): boolean {
  if (!departure.includes(':')) return true; // malformed — drop it
  const [h, m] = departure.split(':');
  const dep = Number(h) * 60 + Number(m) + Math.max(0, delayMin);
  if (!Number.isFinite(dep)) return true;
  // Early morning "now" vs late-evening departure: that departure was
  // yesterday's; treat now as tomorrow so the age computes correctly.
  const now = dep - nowMinutes > 720 ? nowMinutes + 1440 : nowMinutes;
  return now - dep > WATCH_EXPIRY_MIN;
}
