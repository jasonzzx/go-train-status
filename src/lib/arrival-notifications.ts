import { expectedArrivalAt, type ArrivalReminder } from '@/lib/arrival-reminder';

export type ReminderDelivery = 'checking' | 'push' | 'foreground' | 'blocked' | 'unsupported';

function applicationServerKey(base64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function prepareArrivalNotifications(requestPermission: boolean): Promise<{
  delivery: ReminderDelivery;
  subscription: PushSubscriptionJSON | null;
}> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return { delivery: 'unsupported', subscription: null };
  }
  const permission = requestPermission && Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== 'granted') return { delivery: 'blocked', subscription: null };
  const registration = await navigator.serviceWorker.register('/sw.js');
  if (!('PushManager' in window)) return { delivery: 'foreground', subscription: null };
  try {
    const response = await fetch('/api/arrival-reminder', { cache: 'no-store' });
    if (!response.ok) return { delivery: 'foreground', subscription: null };
    const config = await response.json() as { available: boolean; publicKey: string };
    if (!config.available || !config.publicKey) return { delivery: 'foreground', subscription: null };
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(config.publicKey),
    });
    return { delivery: 'push', subscription: subscription.toJSON() };
  } catch {
    return { delivery: 'foreground', subscription: null };
  }
}

export function reminderMessage(reminder: ArrivalReminder): { title: string; body: string } {
  const arrival = new Intl.DateTimeFormat(reminder.lang === 'zh' ? 'zh-CN' : 'en-CA', {
    timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: false,
  }).format(new Date(expectedArrivalAt(reminder)));
  return reminder.lang === 'zh'
    ? { title: `${reminder.destinationName}即将到达`, body: `准备下车。预计 ${arrival} 到达。` }
    : { title: `${reminder.destinationName} in about ${reminder.leadMin} min`, body: `Get ready to leave the train. Estimated arrival ${arrival}.` };
}

export async function showArrivalNotification(reminder: ArrivalReminder, preview = false): Promise<void> {
  if (Notification.permission !== 'granted') return;
  const message = reminderMessage(reminder);
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(message.title, {
    body: message.body,
    icon: '/icons/icon-192x192.png',
    tag: `${preview ? 'go-arrival-preview' : 'go-arrival'}-${reminder.id}`,
  });
}
