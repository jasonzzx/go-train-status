import { NextResponse, type NextRequest } from 'next/server';
import { metrolinxEnabled } from '@/lib/metrolinx/client';
import { getLiveStatusByTripNumber, torontoMinutesNow, type LiveTrainStatus } from '@/lib/metrolinx/trains';
import { torontoDateStr } from '@/lib/platform-store';
import { cronAuthorized, torontoHour } from '@/lib/cron-auth';
import {
  listWatches,
  updateWatches,
  deleteWatchFields,
  notificationStoreEnabled,
  type TripWatch,
} from '@/lib/notification-store';
import { decideNotifications, applySentEvent, watchExpired, type LiveSnapshot } from '@/lib/notify-rules';
import { buildPushPayload } from '@/lib/notify-messages';
import { sendPush, pushEnabled } from '@/lib/push-sender';

// Checks every watched trip against the live feed and pushes notifications
// for new delays (≥5 min, then growth/recovery), cancellations, and Union
// platform assignments. Sent-state is stored per watch so each event fires
// once (see src/lib/notify-rules.ts for the exact rules).
//
// Drive this from an external scheduler every 1-2 min during service hours —
// platform assignments appear only ~10-15 min before departure, so a coarser
// schedule would eat most of that head start:
//   GET /api/cron/notify        Authorization: Bearer $CRON_SECRET
//   GET /api/cron/notify?secret=$CRON_SECRET   (alternative)

export const dynamic = 'force-dynamic';

const NO_LIVE: LiveSnapshot = { delayMin: 0, cancelled: false, platform: '', hasLive: false };

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!notificationStoreEnabled()) {
    return NextResponse.json({ ok: false, error: 'store not configured' }, { status: 503 });
  }
  if (!pushEnabled()) {
    return NextResponse.json({ ok: false, error: 'VAPID keys not configured' }, { status: 503 });
  }
  if (!metrolinxEnabled()) {
    return NextResponse.json({ ok: false, error: 'metrolinx not enabled' }, { status: 503 });
  }

  // No GO train service ~02:00-03:59 — skip to save API + store calls.
  const hour = torontoHour();
  if (hour === 2 || hour === 3) {
    return NextResponse.json({ ok: true, skipped: 'outside service hours', watches: 0 });
  }

  try {
    const serviceDay = torontoDateStr();
    const watches = await listWatches(serviceDay);
    if (watches.length === 0) {
      return NextResponse.json({ ok: true, watches: 0, sent: 0, deleted: 0 });
    }

    // One live-status fetch per distinct line (each is internally cached and
    // de-duped, so this stays cheap even at a 1-min cadence).
    const lineIds = [...new Set(watches.map(({ watch }) => watch.lineId))];
    const liveByLine = new Map<string, Map<string, LiveTrainStatus>>(
      await Promise.all(
        lineIds.map(async (id) => [id, await getLiveStatusByTripNumber(id)] as const),
      ),
    );

    const nowMin = torontoMinutesNow();
    const updates: Array<{ field: string; watch: TripWatch }> = [];
    const toDelete: string[] = [];
    let sentCount = 0;

    for (const { field, watch } of watches) {
      // Drop watches whose train departed long ago — every event has passed.
      if (watchExpired(watch.departure, watch.sent.delayMin, nowMin)) {
        toDelete.push(field);
        continue;
      }

      const status = liveByLine.get(watch.lineId)?.get(watch.tripNumber);
      const live: LiveSnapshot = status
        ? {
            delayMin: status.delayMin,
            cancelled: status.cancelled,
            platform: status.platform,
            hasLive: status.hasLive,
          }
        : NO_LIVE;

      const { events } = decideNotifications(watch.sent, live, {
        unionDeparture: watch.directionCd === 'Outbound',
      });
      if (events.length === 0) continue;

      // Sent-state advances per event, and only for accepted sends — a
      // transient 'failed' leaves that event pending so the next run retries.
      let nextSent = watch.sent;
      let gone = false;
      for (const event of events) {
        const result = await sendPush(watch.sub, buildPushPayload(event, watch));
        if (result === 'gone') {
          gone = true;
          break;
        }
        if (result === 'sent') {
          sentCount++;
          nextSent = applySentEvent(nextSent, event);
        }
      }
      if (gone) {
        toDelete.push(field); // subscription is dead — nothing to notify anymore
      } else if (nextSent !== watch.sent) {
        updates.push({ field, watch: { ...watch, sent: nextSent } });
      }
    }

    await updateWatches(serviceDay, updates);
    await deleteWatchFields(serviceDay, toDelete);

    return NextResponse.json({
      ok: true,
      watches: watches.length,
      sent: sentCount,
      deleted: toDelete.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
