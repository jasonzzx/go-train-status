import { NextResponse } from 'next/server';
import { validReminder } from '@/lib/arrival-reminder';
import { reminderStoreEnabled, getReminder, saveReminder, cancelReminder, wasCancelled, wasSent } from '@/lib/arrival-reminder-store';
import { pushEnabled, vapidPublicKey, validSubscription } from '@/lib/arrival-push';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ available: reminderStoreEnabled() && pushEnabled(), publicKey: vapidPublicKey() });
}

export async function PUT(request: Request) {
  if (!reminderStoreEnabled() || !pushEnabled()) {
    return NextResponse.json({ error: 'Push is not configured' }, { status: 503 });
  }
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!input || typeof input !== 'object') return NextResponse.json({ error: 'Invalid reminder' }, { status: 400 });
  const { reminder, subscription } = input as Record<string, unknown>;
  if (!validReminder(reminder) || !validSubscription(subscription)
    || Math.abs(reminder.scheduledArrivalAt - Date.now()) > 12 * 60 * 60_000) {
    return NextResponse.json({ error: 'Invalid reminder' }, { status: 400 });
  }
  try {
    if (await wasCancelled(reminder)) return NextResponse.json({ error: 'Reminder cancelled' }, { status: 409 });
    const previous = await getReminder(reminder.deviceId);
    if (previous?.reminder.id === reminder.id && previous.reminder.sent || await wasSent(reminder)) reminder.sent = true;
    await saveReminder({ reminder, subscription });
    return NextResponse.json({ ok: true, sent: reminder.sent });
  } catch {
    return NextResponse.json({ error: 'Could not save reminder' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!reminderStoreEnabled()) return NextResponse.json({ ok: true });
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!input || typeof input !== 'object') return NextResponse.json({ error: 'Invalid reminder' }, { status: 400 });
  const { deviceId, id, token } = input as Record<string, unknown>;
  if (typeof deviceId !== 'string' || !/^[a-f0-9-]{36}$/.test(deviceId)
    || typeof id !== 'string' || id.length > 100
    || typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token)) return NextResponse.json({ error: 'Invalid reminder' }, { status: 400 });
  try {
    await cancelReminder(deviceId, id, token);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Could not cancel reminder' }, { status: 503 }); }
}
