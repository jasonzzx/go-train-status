// ── Client-side push plumbing ────────────────────────────────────────────────
// Everything the bell toggle needs: feature detection, service-worker
// registration + push subscription, the watch/unwatch API calls, and a
// localStorage mirror of which of today's trips this browser is watching
// (so bells render correctly across reloads without a server round-trip).
//
// Browser-only — call from client components after mount.

export interface NotificationConfig {
  enabled: boolean;
  publicKey: string;
}

export interface WatchParams {
  tripNumber: string;
  lineId: string;
  directionCd: 'Inbound' | 'Outbound';
  departure: string;
  dest: string;
  lang: string;
}

/** Web Push needs SW + PushManager + Notification. On iOS (16.4+) these only
    exist once the app is installed to the Home Screen. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

let configPromise: Promise<NotificationConfig> | null = null;

/** Server-side feature flag + VAPID public key, fetched once per page load. */
export function getNotificationConfig(): Promise<NotificationConfig> {
  if (!configPromise) {
    configPromise = fetch('/api/notifications')
      .then((res) => (res.ok ? res.json() : { enabled: false, publicKey: '' }))
      .catch(() => ({ enabled: false, publicKey: '' }));
  }
  return configPromise;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Register the worker, ask for permission (first time only), and return the
 * push subscription (existing or newly created). Throws Error('denied') when
 * the user has blocked notifications.
 */
export async function ensurePushSubscription(publicKey: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.register('/sw.js');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
}

/** The current push subscription, if the worker is registered and subscribed. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function watchTrip(sub: PushSubscription, params: WatchParams): Promise<void> {
  const res = await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), ...params }),
  });
  if (!res.ok) throw new Error(`watch failed: HTTP ${res.status}`);
}

export async function unwatchTrip(endpoint: string, tripNumber: string): Promise<void> {
  await fetch('/api/notifications', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, tripNumber }),
  }).catch(() => {
    // best-effort: the watch expires server-side ~90 min after departure anyway
  });
}

// ── localStorage mirror of today's watched trips ────────────────────────────
// `${directionCd}:${departure}` → tripNumber, scoped to one service day.

export const WATCHES_STORAGE_KEY = 'go-train-watches';

interface StoredWatches {
  date: string;
  map: Record<string, string>;
}

export function watchKey(directionCd: 'Inbound' | 'Outbound', departure: string): string {
  return `${directionCd}:${departure}`;
}

/** This browser's watched trips for the given service day ({} for any other day). */
export function loadWatched(dateStr: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(WATCHES_STORAGE_KEY);
    if (!raw) return {};
    const stored = JSON.parse(raw) as StoredWatches;
    return stored.date === dateStr && stored.map ? stored.map : {};
  } catch {
    return {};
  }
}

export function saveWatched(dateStr: string, map: Record<string, string>): void {
  try {
    localStorage.setItem(WATCHES_STORAGE_KEY, JSON.stringify({ date: dateStr, map }));
  } catch {
    // storage full/blocked — bells just won't persist across reloads
  }
}
