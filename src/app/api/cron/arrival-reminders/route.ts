import { NextResponse } from 'next/server';
import { reminderDue } from '@/lib/arrival-reminder';
import { activeReminders, claimReminder, deleteReminder, getReminder, markSent, releaseReminder, reminderStoreEnabled, saveReminder, wasCancelled, wasSent } from '@/lib/arrival-reminder-store';
import { pushEnabled, sendArrivalPush } from '@/lib/arrival-push';
import { metrolinxEnabled } from '@/lib/metrolinx/client';
import { getLiveStatusByTripNumber, type LiveTrainStatus } from '@/lib/metrolinx/trains';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!reminderStoreEnabled() || !pushEnabled()) {
    return NextResponse.json({ error: 'Reminder service not configured' }, { status: 503 });
  }
  const now = Date.now();
  let checked = 0;
  let sent = 0;
  const errors: string[] = [];
  try {
    const active = await activeReminders(now);
    const liveByLine = new Map<string, Map<string, LiveTrainStatus> | null>();
    for (const value of active) {
      const reminder = value.reminder;
      checked++;
      if (reminder.sent || await wasSent(reminder)) continue;
      if (!liveByLine.has(reminder.lineId)) {
        liveByLine.set(reminder.lineId, metrolinxEnabled()
          ? await getLiveStatusByTripNumber(reminder.lineId).catch(() => null)
          : null);
      }
      const status = liveByLine.get(reminder.lineId)?.get(reminder.tripNumber);
      if (status?.cancelled) {
        await deleteReminder(reminder.deviceId);
        continue;
      }
      if (status?.hasLive && Number.isInteger(status.delayMin) && status.delayMin >= 0) {
        reminder.delayMin = status.delayMin;
      }
      if (now >= reminder.scheduledArrivalAt + reminder.delayMin * 60_000) {
        await deleteReminder(reminder.deviceId);
        continue;
      }
      if (!reminderDue(reminder, now)) {
        await saveReminder(value);
        continue;
      }
      if (!await claimReminder(reminder)) continue;
      try {
        const latest = await getReminder(reminder.deviceId);
        if (!latest || latest.reminder.id !== reminder.id || !latest.reminder.enabled
          || await wasCancelled(reminder) || await wasSent(reminder)
          || !reminderDue(latest.reminder, Date.now())) continue;
        await sendArrivalPush(latest);
        await markSent(reminder);
        reminder.sent = true;
        await saveReminder(value);
        sent++;
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) await deleteReminder(reminder.deviceId);
        errors.push(error instanceof Error ? error.message : String(error));
      } finally {
        await releaseReminder(reminder);
      }
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), checked, sent }, { status: 500 });
  }
  return NextResponse.json({ ok: errors.length === 0, checked, sent, errors }, { status: errors.length ? 500 : 200 });
}
