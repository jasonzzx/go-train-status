'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  getScheduleForStation,
  tripsForStation,
  getServiceType,
  timeToMinutes,
  type Direction,
  type Trip,
} from '@/lib/schedule-data';
import {
  getLine,
  getStation,
  DEFAULT_LINE_ID,
  type GtfsTrip,
  type LineInfo,
  type StationInfo,
} from '@/lib/lines';
import type { ParsedAlert } from '@/app/api/alerts/route';
import type { TrackerTrip } from '@/app/api/tracker/route';
import { useLanguage, getStationName, lineDisplayName } from '@/i18n';
import { loadPlatformCache, savePlatformCache } from '@/lib/platform-cache';
import { torontoNow } from '@/lib/toronto-time';
import {
  buildTrackerMaps,
  getTrackerInfo,
  type TrackerInfo,
} from '@/lib/tracker-info';
import { computeLineStatus, type LineStatus } from '@/lib/line-status';
import { buildAlertMap } from '@/lib/alert-match';
import {
  LINE_STORAGE_KEY,
  homeStationKey,
  loadHomeStation,
  loadLineId,
} from '@/lib/preferences';
import {
  pushSupported,
  getNotificationConfig,
  ensurePushSubscription,
  getCurrentSubscription,
  watchTrip,
  unwatchTrip,
  watchKey,
  loadWatched,
  saveWatched,
} from '@/lib/push-client';
import { BellIcon, LineStatusIcon, ArrowRightIcon } from '@/components/icons';
import LinePicker from '@/components/LinePicker';
import StationPicker from '@/components/StationPicker';
import TrainCard from '@/components/TrainCard';
import WeekendNotice from '@/components/WeekendNotice';
import ServiceAlertsSheet from '@/components/ServiceAlertsSheet';
import PlatformMapSheet, { type PlatformSheetInfo } from '@/components/PlatformMapSheet';

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

// All "what time / day is it" logic runs on the Toronto clock (torontoNow),
// not the device clock — see src/lib/toronto-time.ts.

function getDefaultDate(): string {
  return torontoNow().dateStr;
}

function getTomorrowStr(): string {
  const [y, m, d] = torontoNow().dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function getDefaultDirection(): Direction {
  return torontoNow().minutes < 720 ? 'homeToOffice' : 'officeToHome';
}

function parseTime(time: string): number {
  return timeToMinutes(time);
}

// ──────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────

// Line + home-station persistence lives in src/lib/preferences.ts. The
// loaders read localStorage and so must only ever run client-side, after
// mount — never as a useState lazy initializer, or the client's first
// render (during hydration) won't match the server-rendered default and
// React will throw a hydration mismatch.

export default function Home() {
  const { lang, setLang, t } = useLanguage();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [selectedDate, setSelectedDate] = useState(getDefaultDate);
  const [direction, setDirection] = useState<Direction>(getDefaultDirection);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  const [todayStr, setTodayStr] = useState<string>('');

  // Active line + home station, both persisted (home station per line).
  // Initial state must match the SSR-rendered default exactly — the
  // persisted choice is restored client-side after mount (see effect below)
  // to avoid a hydration mismatch.
  const [lineId, setLineId] = useState<string>(DEFAULT_LINE_ID);
  const line: LineInfo = getLine(lineId);
  const [homeStationCode, setHomeStationCode] = useState<string>(() => getLine(DEFAULT_LINE_ID).defaultHomeCode);
  const homeStation: StationInfo = getStation(lineId, homeStationCode);

  // Switching line: remember the choice and restore that line's home station.
  // Persistence happens here (and in handleHomeStationChange below) — only on
  // explicit user action — rather than in a generic effect keyed on
  // [lineId]/[homeStationCode]. A generic persist-on-change effect would also
  // fire for the mount-time restoration below, racing it: the effect's first
  // pass (still holding the pre-restoration closure) would overwrite the
  // just-restored localStorage value with the SSR default.
  const handleLineChange = useCallback((newLineId: string) => {
    const newHome = loadHomeStation(getLine(newLineId));
    setLineId(newLineId);
    setHomeStationCode(newHome);
    localStorage.setItem(LINE_STORAGE_KEY, newLineId);
    localStorage.setItem(homeStationKey(newLineId), newHome);
  }, []);

  const handleHomeStationChange = useCallback((code: string) => {
    setHomeStationCode(code);
    localStorage.setItem(homeStationKey(lineId), code);
  }, [lineId]);

  // Restore the persisted line/home station after mount (client-only) —
  // read-only, does not touch localStorage.
  useEffect(() => {
    const storedLineId = loadLineId();
    setLineId(storedLineId);
    setHomeStationCode(loadHomeStation(getLine(storedLineId)));
  }, []);

  // Tracker state (platform + expected)
  const [trackerTrips, setTrackerTrips] = useState<TrackerTrip[]>([]);

  // Clear stale tracker data immediately when line or home station changes
  useEffect(() => {
    setTrackerTrips([]);
    setLastRefreshed(null);
  }, [lineId, homeStationCode]);

  // The selected date's actual schedule from the official API (holiday-aware,
  // unlike the bundled static GTFS which bakes one representative day per
  // service type). Static renders instantly; this swaps in when it arrives.
  const [liveDay, setLiveDay] = useState<{ toUnion: GtfsTrip[]; fromUnion: GtfsTrip[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLiveDay(null);
    (async () => {
      try {
        const res = await fetch(`/api/schedule?code=${lineId}&date=${selectedDate}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.available) {
          setLiveDay({ toUnion: data.toUnion ?? [], fromUnion: data.fromUnion ?? [] });
        }
      } catch {
        // keep the static schedule
      }
    })();
    return () => { cancelled = true; };
  }, [lineId, selectedDate]);

  // Alerts state
  const [alerts, setAlerts] = useState<ParsedAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsAvailable, setAlertsAvailable] = useState(false);
  const [alertsLastUpdated, setAlertsLastUpdated] = useState<string | null>(null);
  const [showAlertsSheet, setShowAlertsSheet] = useState(false);
  const [platformSheet, setPlatformSheet] = useState<PlatformSheetInfo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState(30);
  const [expandedDep, setExpandedDep] = useState<string | null>(null);
  const [onBoardDep, setOnBoardDep] = useState<string | null>(null);
  const [trackerSource, setTrackerSource] = useState<string | null>(null);
  const [alertsSource, setAlertsSource] = useState<string | null>(null);
  const [showDataSourceInfo, setShowDataSourceInfo] = useState(false);

  // Push-notification watches — which of today's trips this browser asked to
  // be notified about ("directionCd:departure" → trip number). Mirrored in
  // localStorage; the authoritative copy lives server-side (notification-store)
  // where /api/cron/notify reads it.
  const [watched, setWatched] = useState<Record<string, string>>({});
  // True when this browser can do Web Push AND the server has it configured —
  // gates whether bells render at all.
  const [notifReady, setNotifReady] = useState(false);
  // Transient feedback for the bell (permission denied, confirmed, …).
  const [notifNotice, setNotifNotice] = useState<string | null>(null);
  const notifNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Last-known platform per train ("direction:departure" → platform), remembered
  // in this browser's localStorage for the current service day. The live feed
  // drops a platform the moment its train departs, so we fall back to this so
  // the badge survives the NEXT → NOW flip and page reloads. See platform-cache.
  const [platformCache, setPlatformCache] = useState<Record<string, string>>({});

  // Author photo "zoom from icon" reveal — see openAuthorPhoto/closeAuthorPhoto below.
  const authorIconRef = useRef<HTMLButtonElement>(null);
  const [authorPhase, setAuthorPhase] = useState<'closed' | 'opening' | 'open' | 'closing'>('closed');
  const [authorTransform, setAuthorTransform] = useState('scale(0.05)');
  const [authorFinalSize, setAuthorFinalSize] = useState(360);
  const authorClosedTransformRef = useRef('scale(0.05)');

  // Computes the transform that overlaps the full-size photo exactly onto the
  // small icon's screen rect, so the grow/shrink animation appears to
  // originate from the icon itself rather than just zooming from center.
  const openAuthorPhoto = useCallback(() => {
    const finalSize = Math.min(window.innerWidth * 0.82, 420);
    setAuthorFinalSize(finalSize);

    const rect = authorIconRef.current?.getBoundingClientRect();
    if (rect) {
      const iconCenterX = rect.left + rect.width / 2;
      const iconCenterY = rect.top + rect.height / 2;
      const dx = iconCenterX - window.innerWidth / 2;
      const dy = iconCenterY - window.innerHeight / 2;
      const scale = rect.width / finalSize;
      authorClosedTransformRef.current = `translate(${dx}px, ${dy}px) scale(${scale})`;
    } else {
      authorClosedTransformRef.current = 'scale(0.05)';
    }
    setAuthorTransform(authorClosedTransformRef.current);
    setAuthorPhase('opening');
  }, []);

  const closeAuthorPhoto = useCallback(() => {
    setAuthorTransform(authorClosedTransformRef.current);
    setAuthorPhase('closing');
  }, []);

  useEffect(() => {
    if (authorPhase === 'opening') {
      const id = requestAnimationFrame(() => {
        setAuthorTransform('translate(0px, 0px) scale(1)');
        setAuthorPhase('open');
      });
      return () => cancelAnimationFrame(id);
    }
    if (authorPhase === 'closing') {
      const id = setTimeout(() => setAuthorPhase('closed'), 450);
      return () => clearTimeout(id);
    }
  }, [authorPhase]);

  // Clock tick. Browsers throttle (or fully pause) setInterval in background
  // tabs, so a card's NEXT->NOW switch can lag well behind the real
  // departure time if the user looks away and back. Re-sync immediately on
  // tab focus/visibility return instead of waiting for the next tick.
  useEffect(() => {
    const update = () => {
      const now = torontoNow();
      setNowMinutes(now.minutes);
      setTodayStr(now.dateStr);
    };
    update();
    const id = setInterval(update, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') update();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', update);
    };
  }, []);

  // Fetch tracker (platform + expected) every 30 seconds
  const fetchTracker = useCallback(async () => {
    try {
      const res = await fetch(`/api/tracker?home=${homeStation.railsixSlug}&code=${lineId}`);
      if (!res.ok) return;
      const data = await res.json();
      setTrackerTrips(data.trips ?? []);
      setTrackerSource(data.source ?? null);
      setLastRefreshed(new Date());
      setRefreshCountdown(30);
    } catch {
      // non-critical
    }
  }, [homeStation.railsixSlug, lineId]);

  useEffect(() => {
    fetchTracker();
    const id = setInterval(fetchTracker, 30_000);
    return () => clearInterval(id);
  }, [fetchTracker]);

  // Fetch alerts every 5 min
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`/api/alerts?code=${lineId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      setAlertsAvailable(data.available ?? false);
      setAlertsSource(data.source ?? null);
      if (data.lastUpdated) setAlertsLastUpdated(data.lastUpdated);
    } catch {
      setAlertsAvailable(false);
    } finally {
      setAlertsLoading(false);
    }
  }, [lineId]);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 5 * 60_000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  // Countdown tick — decrements every second toward next auto-refresh
  useEffect(() => {
    const id = setInterval(() => {
      setRefreshCountdown((prev) => (prev <= 1 ? 30 : prev - 1));
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  // Manual refresh — both tracker + alerts simultaneously
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([fetchTracker(), fetchAlerts()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, fetchTracker, fetchAlerts]);

  const serviceType = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return getServiceType(new Date(y, m - 1, d));
  }, [selectedDate]);

  const trips: Trip[] = useMemo(() => {
    const base = liveDay
      ? tripsForStation(
          direction === 'homeToOffice' ? liveDay.toUnion : liveDay.fromUnion,
          direction,
          homeStationCode,
        )
      : getScheduleForStation(lineId, direction, serviceType, homeStationCode);
    // Trips departing at 24:xx+ belong to the next calendar morning — showing
    // them as "24:10" cards on this date's panel is just confusing, so hide them.
    return base.filter((t) => parseTime(t.departure) < 1440);
  }, [liveDay, lineId, direction, serviceType, homeStationCode]);

  const isToday = selectedDate === todayStr;

  // Tracker lookup maps
  const { inbound: trackerInbound, outbound: trackerOutbound } = useMemo(
    () => buildTrackerMaps(trackerTrips),
    [trackerTrips]
  );

  // Expected departure in minutes: scheduled + live delay when we have one.
  // A train running +15 late hasn't left yet — it must stay catchable (NEXT)
  // instead of flipping to past/NOW at its scheduled minute.
  const effectiveDeparture = useCallback(
    (trip: Trip): number => {
      const info = isToday ? getTrackerInfo(trip, direction, trackerInbound, trackerOutbound) : null;
      return parseTime(trip.departure) + (info?.delay ?? 0);
    },
    [isToday, direction, trackerInbound, trackerOutbound]
  );

  const nextIndex = useMemo(() => {
    if (!isToday || nowMinutes === null) return -1;
    // First trip still expected to depart, skipping cancelled ones — a
    // cancelled train shouldn't hold the NEXT badge or run a countdown.
    return trips.findIndex((t) => {
      const info = getTrackerInfo(t, direction, trackerInbound, trackerOutbound);
      if (info?.cancelled) return false;
      return effectiveDeparture(t) > nowMinutes;
    });
  }, [trips, isToday, nowMinutes, direction, trackerInbound, trackerOutbound, effectiveDeparture]);

  const alertMap = useMemo(
    () => buildAlertMap(alerts, direction),
    [alerts, direction]
  );

  // Load this browser's remembered platforms for the current service day.
  useEffect(() => {
    if (todayStr) setPlatformCache(loadPlatformCache(todayStr));
  }, [todayStr]);

  // Restore today's watched trips + check whether push is available at all
  // (browser support and server configuration) so bells only render when a
  // tap can actually succeed.
  useEffect(() => {
    if (todayStr) setWatched(loadWatched(todayStr));
  }, [todayStr]);

  useEffect(() => {
    if (!pushSupported()) return;
    let cancelled = false;
    getNotificationConfig().then((cfg) => {
      if (!cancelled) setNotifReady(cfg.enabled);
    });
    return () => { cancelled = true; };
  }, []);

  const showNotifNotice = useCallback((message: string) => {
    if (notifNoticeTimer.current) clearTimeout(notifNoticeTimer.current);
    setNotifNotice(message);
    notifNoticeTimer.current = setTimeout(() => setNotifNotice(null), 6_000);
  }, []);

  // Bell toggle: subscribe this browser to pushes for one specific trip today
  // (delay ≥5 min, cancellation, Union platform assignment), or unsubscribe.
  // The first watch triggers the browser's notification-permission prompt.
  const handleToggleWatch = useCallback(async (trip: Trip) => {
    if (!todayStr) return;
    const dirKey = direction === 'homeToOffice' ? 'Inbound' : 'Outbound';
    const key = watchKey(dirKey, trip.departure);
    const tripNumber = trip.tripId.split('-').pop() ?? '';
    if (!tripNumber) return;

    if (watched[key]) {
      const next = { ...watched };
      delete next[key];
      setWatched(next);
      saveWatched(todayStr, next);
      const sub = await getCurrentSubscription();
      if (sub) unwatchTrip(sub.endpoint, tripNumber);
      return;
    }

    try {
      const cfg = await getNotificationConfig();
      if (!cfg.enabled) {
        showNotifNotice(t('notifUnavailable'));
        return;
      }
      const sub = await ensurePushSubscription(cfg.publicKey);
      await watchTrip(sub, {
        tripNumber,
        lineId,
        directionCd: dirKey,
        departure: trip.departure,
        dest:
          direction === 'homeToOffice'
            ? t('unionStation')
            : getStationName(homeStation.code, homeStation.shortName, lang),
        lang,
      });
      const next = { ...watched, [key]: tripNumber };
      setWatched(next);
      saveWatched(todayStr, next);
      showNotifNotice(t('notifWatchOn', { departure: trip.departure }));
    } catch (err) {
      showNotifNotice(
        err instanceof Error && err.message === 'denied' ? t('notifDenied') : t('notifWatchFailed'),
      );
    }
  }, [watched, todayStr, direction, lineId, homeStation, lang, t, showNotifNotice]);

  // Record every platform the live feed publishes, so we can keep showing it
  // after the feed drops it at departure. Only the viewed direction carries a
  // platform (Union departures), which is exactly what's in scope here.
  useEffect(() => {
    if (!isToday || !todayStr) return;
    setPlatformCache((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const trip of trips) {
        const live = getTrackerInfo(trip, direction, trackerInbound, trackerOutbound)?.platform;
        const key = `${direction}:${trip.departure}`;
        if (live && next[key] !== live) {
          next[key] = live;
          changed = true;
        }
      }
      if (!changed) return prev;
      savePlatformCache(todayStr, next);
      return next;
    });
  }, [trips, direction, isToday, todayStr, trackerInbound, trackerOutbound]);

  // Platform to show for a trip:
  //  - the live feed value always wins — it's the ONLY source a not-yet-departed
  //    (NEXT) card may show, since GO assigns platforms ~10-15 min out and
  //    anything else for a future trip would be a stale guess;
  //  - once the trip has departed, fall back to the value remembered earlier
  //    today (localStorage here, Redis via the tracker response) so past/NOW
  //    cards keep their platform for the whole service day.
  const platformFor = useCallback(
    (trip: { departure: string; arrival: string }): string => {
      const live = getTrackerInfo(trip, direction, trackerInbound, trackerOutbound)?.platform;
      if (live) return live;
      if (nowMinutes === null || parseTime(trip.departure) > nowMinutes) return '';
      return platformCache[`${direction}:${trip.departure}`] || '';
    },
    [direction, trackerInbound, trackerOutbound, platformCache, nowMinutes]
  );

  // Live stop names from tracker: "directionCd:scheduledTime" → stops[]
  const trackerStopsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of trackerTrips) {
      if (t.stops && t.stops.length > 0) {
        m.set(`${t.directionCd}:${t.scheduledTime}`, t.stops);
      }
    }
    return m;
  }, [trackerTrips]);

  const totalAlerts = alerts.length;

  const lineStatus: LineStatus = useMemo(
    () => computeLineStatus(trips, trackerTrips),
    [trips, trackerTrips]
  );

  // For today: scroll to next train. For other dates: scroll to first train at/after 8am.
  const scrollTargetIndex = useMemo(() => {
    if (isToday) return nextIndex;
    const idx = trips.findIndex((t) => parseTime(t.departure) >= 480); // 8:00
    return idx >= 0 ? idx : 0;
  }, [isToday, nextIndex, trips]);

  // Auto-scroll whenever the visible schedule changes, positioning the
  // "now" card as the 2nd card visible below the sticky header (so the
  // card before it peeks in at the top). Computed manually rather than via
  // scrollIntoView, which ignores the sticky header's overlap and leaves
  // cards sitting too high. Re-runs once alerts finish loading, since the
  // alert banner can grow the header and shift the layout after the first
  // scroll already ran.
  useEffect(() => {
    if (scrollTargetIndex < 0) return;
    const t = setTimeout(() => {
      const nextEl = document.getElementById('scroll-target');
      if (!nextEl) return;
      const nowEl = nextEl.previousElementSibling as HTMLElement | null;
      const beforeNowEl = nowEl?.previousElementSibling as HTMLElement | null;
      const anchorEl = beforeNowEl ?? nowEl ?? nextEl;
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
      const anchorRect = anchorEl.getBoundingClientRect();
      const anchorTopInDoc = window.scrollY + anchorRect.top;
      const targetScrollY = anchorTopInDoc - headerHeight;
      window.scrollTo({ top: Math.max(0, targetScrollY), behavior: 'smooth' });
    }, 150);
    return () => clearTimeout(t);
  }, [scrollTargetIndex, selectedDate, direction, alertsLoading]);

  // Collapse expanded cards when switching line, date or direction
  useEffect(() => {
    setExpandedDep(null);
    setOnBoardDep(null);
  }, [lineId, selectedDate, direction]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col max-w-md mx-auto">
      {/* ── Header ── */}
      <header ref={headerRef} className="sticky top-0 z-20 bg-go-dark text-white shadow-lg">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <div className="shrink-0 w-9 h-9">
            <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <defs>
                <linearGradient id="logoRim" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#e8fff0"/>
                  <stop offset="0.3" stopColor="#7ED957"/>
                  <stop offset="0.55" stopColor="#0b3d2c"/>
                  <stop offset="0.8" stopColor="#7ED957"/>
                  <stop offset="1" stopColor="#e8fff0"/>
                </linearGradient>
              </defs>
              {/* Metallic bevel rim */}
              <circle cx="18" cy="18" r="16.4" fill="none" stroke="url(#logoRim)" strokeWidth="1.6"/>
              {/* Background circle */}
              <circle cx="18" cy="18" r="14.4" fill="#00853E"/>
              <g transform="translate(18,18) scale(0.8) translate(-18,-18)">
                {/* Train body */}
                <rect x="6" y="13" width="24" height="10" rx="2.5" fill="white"/>
                {/* Cab window */}
                <rect x="22" y="15" width="6" height="5" rx="1" fill="#00853E" opacity="0.85"/>
                {/* Side windows */}
                <rect x="8" y="15" width="4" height="3.5" rx="0.8" fill="#00853E" opacity="0.85"/>
                <rect x="14" y="15" width="4" height="3.5" rx="0.8" fill="#00853E" opacity="0.85"/>
                {/* Wheels */}
                <circle cx="11" cy="25" r="2.5" fill="white"/>
                <circle cx="25" cy="25" r="2.5" fill="white"/>
                {/* Rail */}
                <rect x="4" y="27" width="28" height="1.5" rx="0.75" fill="white" opacity="0.4"/>
                {/* Status dot — green pulse indicator */}
                <circle cx="29" cy="9" r="4" fill="#1c3a5e"/>
                <circle cx="29" cy="9" r="2.5" fill="#4ade80"/>
              </g>
            </svg>
          </div>
          <div>
            <div className="font-bold text-base leading-tight">{t('appTitle')}</div>
            <div className="text-white/60 text-xs">{t('lineOption', { name: lineDisplayName(line, lang) })}</div>
          </div>

          {/* Service status icon — same size as the logo so it's the most visible thing
              in the header, since this app's whole purpose is showing line status. */}
          <button
            onClick={() => setShowAlertsSheet(true)}
            className="relative shrink-0 w-9 h-9 rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center"
            title={t('serviceUpdates', { name: lineDisplayName(line, lang) })}
          >
            {alertsLoading ? (
              <BellIcon className="w-7 h-7 text-white/70" />
            ) : (
              <LineStatusIcon status={lineStatus} className="w-7 h-7" />
            )}
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white/80 text-xs font-semibold whitespace-nowrap shrink-0"
              title="EN / 中文"
            >
              {lang === 'en' ? '中文' : 'EN'}
            </button>

            <div className="w-px h-4 bg-white/20" />

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
              title={t('refreshLiveData')}
            >
              <svg
                className={`w-5 h-5 text-white/70 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Share button — native OS share sheet (includes Add to Home Screen on mobile) */}
            <button
              onClick={() => {
                const shareUrl = `${window.location.origin}/${lang}`;
                const shareTitle = lang === 'zh' ? 'GO 列车状态' : 'GO Train Status';
                const shareText  = lang === 'zh' ? 'GO 列车状态实时追踪' : 'GO Train Status Live Tracker';
                if (navigator.share) {
                  navigator.share({ title: shareTitle, text: shareText, url: shareUrl }).catch(() => {});
                } else {
                  navigator.clipboard?.writeText(shareUrl).catch(() => {});
                }
              }}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="Share"
            >
              <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 3v13m0-13l-4 4m4-4l4 4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Line picker */}
        <div className="flex items-center gap-2 mx-4 mb-2">
          <span className="text-white/60 text-sm shrink-0 w-14 flex items-center gap-1.5">
            <span className="w-4 flex items-center justify-center shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-go-green" />
            </span>
            {t('lineLabel')}
          </span>
          <LinePicker line={line} lang={lang} t={t} onChange={handleLineChange} />
        </div>

        {/* Home station picker */}
        <div className="flex items-center gap-2 mx-4 mb-2">
          <span className="text-white/60 text-sm shrink-0 w-14 flex items-center gap-1.5">
            <span className="w-4 flex items-center justify-center shrink-0">🏠</span>
            {t('homeLabel')}
          </span>
          <StationPicker line={line} stationCode={homeStationCode} lang={lang} onChange={handleHomeStationChange} />
        </div>

        {/* Direction tabs */}
        <div className="flex mx-4 mb-3 bg-white/10 rounded-xl p-1 gap-1">
          <button
            onClick={() => setDirection('homeToOffice')}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-semibold transition-all ${
              direction === 'homeToOffice' ? 'bg-go-green text-white shadow' : 'text-white/70'
            }`}
          >
            <div className="text-sm leading-tight">🏠 {getStationName(homeStation.code, homeStation.shortName, lang)}</div>
            <div className="text-sm text-white/60">{t('homeToUnion')}</div>
          </button>
          <button
            onClick={() => setDirection('officeToHome')}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-semibold transition-all ${
              direction === 'officeToHome' ? 'bg-go-green text-white shadow' : 'text-white/70'
            }`}
          >
            <div className="text-sm leading-tight">🏢 {t('unionShort')}</div>
            <div className="text-sm text-white/60">{t('unionToHome', { home: getStationName(homeStation.code, homeStation.shortName, lang) })}</div>
          </button>
        </div>

        {/* Date picker row */}
        <div className="flex items-center justify-between gap-2 px-4 pb-3">
          <div className="relative h-9 w-[150px]">
            <svg className="absolute left-2.5 inset-y-0 my-auto w-4 h-4 text-white/50 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path strokeLinecap="round" d="M3 9h18M8 3v4M16 3v4" />
              <circle cx="8" cy="13.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="12" cy="13.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="16" cy="13.5" r="1" fill="currentColor" stroke="none" />
            </svg>
            <input
              ref={dateInputRef}
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              onClick={(e) => {
                e.currentTarget.showPicker?.();
              }}
              className="w-full h-9 box-border appearance-none bg-white/10 text-white text-sm rounded-lg pl-8 pr-2 border border-white/20 focus:outline-none focus:border-white/50"
            />
          </div>
          {isToday ? (
            <button
              key="tomorrow-btn"
              onClick={() => {
                setSelectedDate(getTomorrowStr());
                setDirection('homeToOffice');
              }}
              className="shrink-0 h-9 bg-white/10 text-white text-sm font-semibold px-3 rounded-lg border border-white/20 hover:bg-white/20 transition-colors"
            >
              {t('tomorrow')}
            </button>
          ) : (
            <button
              key="today-btn"
              onClick={() => {
                setSelectedDate(todayStr);
                setDirection(getDefaultDirection());
              }}
              className="shrink-0 h-9 bg-go-accent text-white text-sm font-semibold px-3 rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('today')}
            </button>
          )}
        </div>

        {/* Route bar */}
        <div className="bg-go-green text-white px-4 py-2 flex items-center gap-2 text-sm">
          <span className="font-semibold">
            {direction === 'homeToOffice' ? getStationName(homeStation.code, homeStation.name, lang) : t('unionStation')}
          </span>
          <ArrowRightIcon className="w-4 h-4 shrink-0" />
          <span className="font-semibold">
            {direction === 'homeToOffice' ? t('unionStation') : getStationName(homeStation.code, homeStation.name, lang)}
          </span>
          <span className="ml-auto text-white/70 capitalize text-xs">{t(serviceType)}</span>
        </div>

        {/* Slim alert banner (only when active alerts exist) */}
        {!alertsLoading && totalAlerts > 0 && (
          <button
            onClick={() => setShowAlertsSheet(true)}
            className="w-full flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-left"
          >
            <span className="text-sm">⚠️</span>
            <span className="text-amber-800 text-xs font-medium flex-1">
              {t('activeAlerts', { count: totalAlerts, plural: totalAlerts !== 1 ? 's' : '', name: lineDisplayName(line, lang) })}
            </span>
            <span className="text-amber-600 text-xs font-semibold">{t('view')}</span>
          </button>
        )}
      </header>

      {/* Train list */}
      <main className="flex-1 px-3 py-3 overflow-y-auto">
        {trips.length === 0 ? (
          <WeekendNotice direction={direction} />
        ) : (
          <>
            {trips.map((trip, i) => {
              // Past = expected departure (scheduled + live delay) has gone by.
              const isPast = isToday && nowMinutes !== null && effectiveDeparture(trip) < nowMinutes;
              const isNext = i === nextIndex;
              const tripAlerts = alertMap.get(trip.departure) ?? [];
              const rawTracker = isToday ? getTrackerInfo(trip, direction, trackerInbound, trackerOutbound) : null;
              // Every departed card carries its platform for the whole service
              // day (live value, or the one remembered in localStorage / the
              // server store); a future card only ever carries a live value.
              // Whether the chip is actually visible is decided per-card in
              // TrainCard (NOW always, NEXT when live, past when expanded).
              const showPlatform = isToday ? platformFor(trip) : '';
              const tracker: TrackerInfo | null = rawTracker
                ? { ...rawTracker, platform: showPlatform }
                : showPlatform
                ? { platform: showPlatform, expected: '', delay: 0, cancelled: false, arriveIn: '' }
                : null;
              const isExpanded = expandedDep === trip.departure;
              const isOnBoard = onBoardDep === trip.departure;
              const dirKey = direction === 'homeToOffice' ? 'Inbound' : 'Outbound';
              const liveStops = trackerStopsMap.get(`${dirKey}:${trip.departure}`) ?? [];
              return (
                <div key={i} id={i === scrollTargetIndex ? 'scroll-target' : undefined}>
                  <TrainCard
                    trip={trip}
                    isNext={isNext}
                    isPast={isPast}
                    alerts={tripAlerts}
                    tracker={tracker}
                    direction={direction}
                    lineId={lineId}
                    homeStationCode={homeStationCode}
                    nowMinutes={nowMinutes}
                    isToday={isToday}
                    isExpanded={isExpanded}
                    isOnBoard={isOnBoard}
                    liveStops={liveStops}
                    watchable={
                      notifReady &&
                      isToday &&
                      !isPast &&
                      trip.vehicleType === 'train' &&
                      !tracker?.cancelled
                    }
                    isWatched={Boolean(watched[watchKey(dirKey, trip.departure)])}
                    onToggleWatch={() => handleToggleWatch(trip)}
                    onToggleExpand={() => setExpandedDep(isExpanded ? null : trip.departure)}
                    onToggleOnBoard={() => setOnBoardDep(isOnBoard ? null : trip.departure)}
                    onAlertClick={() => setShowAlertsSheet(true)}
                    onPlatformClick={(platform) =>
                      setPlatformSheet({
                        platform,
                        departure: trip.departure,
                        delayMin: tracker?.cancelled ? 0 : tracker?.delay ?? 0,
                      })
                    }
                  />
                </div>
              );
            })}

            {/* Live data status footer */}
            <div className="relative mt-4 mb-2 mx-1">
              <div className="flex items-stretch rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowDataSourceInfo((v) => !v)}
                  aria-label="Show data source info"
                  className="flex-1 text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors focus:outline-none"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isRefreshing ? (
                        <svg className="w-3.5 h-3.5 text-go-green animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-go-green inline-block" />
                      )}
                      <span className="text-xs font-medium text-gray-700">
                        {isRefreshing ? t('refreshing') : t('liveData')}
                      </span>
                      <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-400">
                      {!isRefreshing && t('nextRefreshIn', { seconds: refreshCountdown })}
                    </span>
                  </div>
                  {lastRefreshed && (
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      {t('lastUpdated', {
                        time: lastRefreshed.toLocaleTimeString('en-CA', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true,
                        }),
                      })}
                    </p>
                  )}
                </button>
                <div className="w-px bg-gray-100 my-2" />
                <a
                  href={
                    direction === 'homeToOffice'
                      ? `https://www.gotransit.com/en/see-schedules?departure=${homeStation.code}&destination=UN&transfers=true`
                      : `https://www.gotransit.com/en/see-schedules?departure=UN&destination=${homeStation.code}&transfers=true`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center px-3 text-xs font-medium text-gray-400 hover:text-go-green transition-colors shrink-0"
                >
                  {t('official')}
                </a>
              </div>
              {showDataSourceInfo && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDataSourceInfo(false)} />
                  <div className="absolute top-full mt-2 left-4 bg-gray-800 text-gray-100 text-[11px] rounded-lg px-3 py-2 shadow-lg whitespace-nowrap z-50">
                    <div className="absolute -top-1 left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-800" />
                    <div className="font-semibold mb-1 text-gray-300">Data Sources</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Tracker:</span>
                      <span className={trackerSource === 'metrolinx' ? 'text-green-400' : 'text-yellow-400'}>
                        {trackerSource === 'metrolinx' ? 'Metrolinx API' : trackerSource === 'railsix' ? 'railsix.com' : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Alerts:</span>
                      <span className={alertsSource === 'metrolinx' ? 'text-green-400' : 'text-yellow-400'}>
                        {alertsSource === 'metrolinx' ? 'Metrolinx API' : alertsSource === 'gotransit' ? 'gotransit.com' : alertsSource === 'railsix' ? 'railsix.com' : '—'}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="text-center text-xs text-gray-400 mt-3 mb-2 pb-safe">
              {t('scheduleEffective', { date: line.effectiveDate, name: lineDisplayName(line, lang) })}
              <br />
              <a
                href="https://github.com/jasonzzx/go-train-status/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-go-green hover:text-go-green transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                {t('reportIssues')}
              </a>
            </div>

            <div className="flex items-center justify-center gap-2.5 text-base text-gray-400 mb-8 pb-safe">
              <button
                ref={authorIconRef}
                onClick={openAuthorPhoto}
                aria-label="Show author photo"
                className="inline-flex w-12 h-12 rounded-full shadow-md shadow-go-green/30 transition-all duration-200 hover:scale-110 hover:shadow-lg hover:shadow-go-green/40 active:scale-95 focus:outline-none"
              >
                <img
                  src="/personal-icons/JASON_LOGO_512.png"
                  alt="Jason Zhong logo"
                  className="w-12 h-12 rounded-full"
                />
              </button>
              <span>{t('authorBy')}</span>
              <a
                href="mailto:jasonzzx@gmail.com"
                title="Email Jason Zhong"
                aria-label="Email Jason Zhong"
                className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-go-green to-go-dark text-white shadow-md shadow-go-green/30 transition-all duration-200 hover:scale-110 hover:shadow-lg hover:shadow-go-green/40 active:scale-95"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            </div>

            {authorPhase !== 'closed' && (
              <div
                className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/85 transition-opacity duration-[450ms] ease-out ${
                  authorPhase === 'open' ? 'opacity-100' : 'opacity-0'
                }`}
                onClick={closeAuthorPhoto}
              >
                <img
                  src="/personal-icons/JASON_LOGO_HQ.jpg"
                  alt="Jason Zhong"
                  style={{
                    width: authorFinalSize,
                    height: authorFinalSize,
                    transform: authorTransform,
                  }}
                  className={`rounded-2xl shadow-2xl object-cover transition-[transform,opacity,filter] duration-[450ms] ease-out ${
                    authorPhase === 'open' ? 'opacity-100 blur-none' : 'opacity-0 blur-lg'
                  }`}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Service Alerts Sheet */}
      {showAlertsSheet && (
        <ServiceAlertsSheet
          line={line}
          alerts={alerts}
          loading={alertsLoading}
          available={alertsAvailable}
          lastUpdated={alertsLastUpdated}
          status={lineStatus}
          onClose={() => setShowAlertsSheet(false)}
        />
      )}

      {/* Platform Map Sheet */}
      {platformSheet && (
        <PlatformMapSheet {...platformSheet} onClose={() => setPlatformSheet(null)} />
      )}

      {/* Transient bell feedback (permission denied, watch confirmed, …) */}
      {notifNotice && (
        <div className="fixed bottom-4 inset-x-4 z-[90] max-w-md mx-auto pointer-events-none">
          <div className="bg-gray-900/95 text-white text-sm rounded-xl px-4 py-3 shadow-lg text-center">
            {notifNotice}
          </div>
        </div>
      )}

    </div>
  );
}
