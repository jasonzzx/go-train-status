// ── Notification message builder (server-side i18n) ─────────────────────────
// The client-side translator (src/i18n) is a React hook, so the cron route
// builds push payloads from the same JSON dicts with a minimal {var}
// interpolator. Each watch stores the language it was created in.

import en from '@/i18n/en.json';
import zh from '@/i18n/zh.json';
import type { NotifyEvent } from '@/lib/notify-rules';
import type { TripWatch } from '@/lib/notification-store';

const DICTS: Record<'en' | 'zh', Record<string, string>> = { en, zh };

function t(lang: 'en' | 'zh', key: string, vars: Record<string, string | number>): string {
  const template = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

export interface PushPayload {
  title: string;
  body: string;
  /** Collapses repeats: a newer delay update replaces the older one. */
  tag: string;
  url: string;
}

const KEYS: Record<NotifyEvent['type'], { title: string; body: string }> = {
  delayed: { title: 'notifDelayedTitle', body: 'notifDelayedBody' },
  recovered: { title: 'notifRecoveredTitle', body: 'notifRecoveredBody' },
  cancelled: { title: 'notifCancelledTitle', body: 'notifCancelledBody' },
  platform: { title: 'notifPlatformTitle', body: 'notifPlatformBody' },
};

export function buildPushPayload(event: NotifyEvent, watch: TripWatch): PushPayload {
  const lang = watch.lang === 'zh' ? 'zh' : 'en';
  const vars = {
    departure: watch.departure,
    dest: watch.dest,
    min: event.delayMin,
    platform: event.platform,
  };
  const keys = KEYS[event.type];
  return {
    title: t(lang, keys.title, vars),
    body: t(lang, keys.body, vars),
    // delayed + recovered share a tag so the all-clear replaces the delay
    // notification instead of stacking under it.
    tag: `${watch.tripNumber}:${event.type === 'recovered' ? 'delayed' : event.type}`,
    url: '/',
  };
}
