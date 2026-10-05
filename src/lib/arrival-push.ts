import webPush from 'web-push';
import type { StoredArrivalReminder } from '@/lib/arrival-reminder-store';
import { expectedArrivalAt } from '@/lib/arrival-reminder';

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

export function pushEnabled(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

export function vapidPublicKey(): string {
  return pushEnabled() ? PUBLIC_KEY : '';
}

export function validSubscription(value: unknown): value is PushSubscriptionJSON {
  if (!value || typeof value !== 'object') return false;
  const subscription = value as PushSubscriptionJSON;
  if (typeof subscription.endpoint !== 'string' || typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') return false;
  try {
    const url = new URL(subscription.endpoint);
    return url.protocol === 'https:' && !url.username && !url.password
      && (url.hostname === 'fcm.googleapis.com'
        || url.hostname === 'fcm-xm.googleapis.com'
        || url.hostname === 'updates.push.services.mozilla.com'
        || url.hostname === 'web.push.apple.com'
        || url.hostname.endsWith('.notify.windows.com'));
  } catch { return false; }
}

export async function sendArrivalPush(value: StoredArrivalReminder): Promise<void> {
  if (!pushEnabled()) throw new Error('Push not configured');
  webPush.setVapidDetails('mailto:jasonzzx@gmail.com', PUBLIC_KEY, PRIVATE_KEY);
  const { reminder, subscription } = value;
  const destination = reminder.destinationName;
  const arrival = new Intl.DateTimeFormat(reminder.lang === 'zh' ? 'zh-CN' : 'en-CA', {
    timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: false,
  }).format(new Date(expectedArrivalAt(reminder)));
  const title = reminder.lang === 'zh'
    ? `${destination}即将到达`
    : `${destination} in about ${reminder.leadMin} min`;
  const body = reminder.lang === 'zh'
    ? `准备下车。预计 ${arrival} 到达。`
    : `Get ready to leave the train. Estimated arrival ${arrival}.`;
  await webPush.sendNotification(subscription as webPush.PushSubscription, JSON.stringify({
    title, body, url: '/', tag: `go-arrival-${reminder.id}`,
  }), { TTL: 120, urgency: 'high' });
}
