// ── Web Push sender (VAPID) ──────────────────────────────────────────────────
// Thin wrapper over the `web-push` library. Keys come from env:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   (npx web-push generate-vapid-keys)
//   VAPID_SUBJECT                          (contact URI, defaults to the
//                                           author's mailto)
// Like every optional integration here, unset env vars mean the feature
// reports itself disabled rather than breaking anything.

import webpush from 'web-push';
import type { PushSubscriptionJSON } from '@/lib/notification-store';

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:jasonzzx@gmail.com';

export function pushEnabled(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

/** The public key the browser needs to create a subscription. */
export function vapidPublicKey(): string {
  return PUBLIC_KEY;
}

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
}

/** 'gone' = the subscription is permanently dead and should be deleted. */
export type PushResult = 'sent' | 'gone' | 'failed';

export async function sendPush(sub: PushSubscriptionJSON, payload: object): Promise<PushResult> {
  if (!pushEnabled()) return 'failed';
  ensureConfigured();
  try {
    // TTL: a delay/platform notice is useless well after the fact — let the
    // push service drop it if the device stays unreachable for 20 min.
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      TTL: 20 * 60,
      urgency: 'high',
    });
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    // 404/410 = subscription expired or unsubscribed at the push service.
    if (status === 404 || status === 410) return 'gone';
    return 'failed';
  }
}
