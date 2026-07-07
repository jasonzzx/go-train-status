import { NextResponse, type NextRequest } from 'next/server';
import {
  notificationStoreEnabled,
  saveWatch,
  deleteWatch,
  type TripWatch,
  type PushSubscriptionJSON,
} from '@/lib/notification-store';
import { pushEnabled, vapidPublicKey } from '@/lib/push-sender';
import { torontoDateStr } from '@/lib/platform-store';
import { EMPTY_SENT } from '@/lib/notify-rules';

// Push-watch management:
//   GET    → is the feature configured, and the VAPID public key to subscribe with
//   POST   → watch one of today's trips (body: subscription + trip identity)
//   DELETE → un-watch (body: subscription endpoint + trip number)
//
// Watches always target the CURRENT service day — the bell only shows on
// today's departures, and the store keys by Toronto date. /api/cron/notify
// does the actual checking + sending.

export const dynamic = 'force-dynamic';

function featureEnabled(): boolean {
  return pushEnabled() && notificationStoreEnabled();
}

export async function GET() {
  return NextResponse.json(
    { enabled: featureEnabled(), publicKey: featureEnabled() ? vapidPublicKey() : '' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

function validSubscription(sub: unknown): sub is PushSubscriptionJSON {
  const s = sub as PushSubscriptionJSON | null;
  return Boolean(
    s &&
      typeof s.endpoint === 'string' &&
      s.endpoint.startsWith('https://') &&
      typeof s.keys?.p256dh === 'string' &&
      typeof s.keys?.auth === 'string',
  );
}

export async function POST(request: NextRequest) {
  if (!featureEnabled()) {
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const { subscription, tripNumber, lineId, directionCd, departure, dest, lang } = body;
  if (
    !validSubscription(subscription) ||
    typeof tripNumber !== 'string' || !/^\w+$/.test(tripNumber) ||
    typeof lineId !== 'string' || !lineId ||
    (directionCd !== 'Inbound' && directionCd !== 'Outbound') ||
    typeof departure !== 'string' || !/^\d{1,2}:\d{2}$/.test(departure) ||
    typeof dest !== 'string'
  ) {
    return NextResponse.json({ ok: false, error: 'invalid watch' }, { status: 400 });
  }

  const watch: TripWatch = {
    sub: { endpoint: subscription.endpoint, keys: subscription.keys },
    tripNumber,
    lineId,
    directionCd,
    departure,
    dest: dest.slice(0, 80),
    lang: lang === 'zh' ? 'zh' : 'en',
    sent: { ...EMPTY_SENT },
  };

  try {
    await saveWatch(torontoDateStr(), watch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!notificationStoreEnabled()) {
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const { endpoint, tripNumber } = body;
  if (typeof endpoint !== 'string' || typeof tripNumber !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }
  try {
    await deleteWatch(torontoDateStr(), endpoint, tripNumber);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
