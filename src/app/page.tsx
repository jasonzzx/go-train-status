'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  getScheduleForStation,
  tripsForStation,
  getServiceType,
  getStops,
  timeToMinutes,
  type Direction,
  type Trip,
  type StationStop,
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
import { getMappedPlatforms, isPlatformMapped } from '@/lib/union-platform-map';
import {
  computeLeaveByMinutes,
  distanceToUnionMetres,
  estimateWalkMinutes,
} from '@/lib/union-map';
import { buildOfficialGuidance } from '@/lib/union-official-map';
import { loadPlatformCache, savePlatformCache } from '@/lib/platform-cache';
import { torontoNow } from '@/lib/toronto-time';
import {
  buildTrackerMaps,
  getTrackerInfo,
  formatPlatformLabel,
  type TrackerInfo,
} from '@/lib/tracker-info';
import { computeLineStatus, type LineStatus } from '@/lib/line-status';
import { buildAlertMap } from '@/lib/alert-match';
import {
  secondsUntilDeparture,
  formatCountdown,
  countdownTone,
  formatMinutesAsHHMM,
  type CountdownTone,
} from '@/lib/countdown';
import {
  LINE_STORAGE_KEY,
  homeStationKey,
  loadHomeStation,
  loadLineId,
} from '@/lib/preferences';
import UnionPlatformMap, { MAP_VIEWBOX_WIDTH, MAP_VIEWBOX_HEIGHT } from '@/components/UnionPlatformMap';
import {
  BellIcon,
  CheckCircleIcon,
  NoServiceIcon,
  MinorDelaysIcon,
  LineStatusIcon,
  ArrowRightIcon,
  TrainIcon,
  BusIcon,
} from '@/components/icons';
import LinePicker from '@/components/LinePicker';
import StationPicker from '@/components/StationPicker';

// The map is drawn from real OpenStreetMap survey geometry
// (src/data/union-station-map.json, regenerate with npm run generate-union-map).
const PLATFORM_MAP_ENABLED = true;

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
// Service Alerts Sheet
// ──────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: ParsedAlert }) {
  const { t } = useLanguage();
  const isDelay = alert.title.toLowerCase().includes('delay');
  const isCancel = alert.title.toLowerCase().includes('cancel');
  const borderColor = isCancel ? 'border-red-500' : isDelay ? 'border-amber-500' : 'border-blue-400';
  const iconBg = isCancel ? 'bg-red-100 text-red-600' : isDelay ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-600';

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderColor} p-4 mb-3`}>
      {/* Title */}
      <div className="flex items-start gap-2 mb-2">
        <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${iconBg}`}>
          {isCancel ? '✕' : '!'}
        </span>
        <span className="font-semibold text-gray-900 text-sm leading-snug">{alert.title}</span>
      </div>

      {/* Route */}
      {(alert.fromStation || alert.toStation) && (
        <div className="flex items-center gap-1 text-sm text-gray-700 mb-1.5 ml-7">
          <span className="font-medium text-gray-800">{alert.fromStation}</span>
          <ArrowRightIcon className="w-3 h-3 text-gray-400 shrink-0" />
          <span className="font-medium text-gray-800">{alert.toStation}</span>
          {alert.direction !== 'both' && (
            <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 border border-gray-300 rounded px-1 py-0.5">
              {alert.direction === 'northbound' ? '↑ NB' : '↓ SB'}
            </span>
          )}
        </div>
      )}

      {/* Schedule */}
      {alert.scheduledDeparture && (
        <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-1.5 ml-7">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {t('scheduled')}{' '}
            <span className="font-mono font-semibold text-gray-800">{alert.scheduledDeparture}</span>
            {alert.scheduledArrival && (
              <>
                {' – '}
                <span className="font-mono font-semibold text-gray-800">{alert.scheduledArrival}</span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Status */}
      {alert.status && (
        <div className="flex items-center gap-1.5 text-sm mb-1.5 ml-7">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              alert.status.toLowerCase() === 'stopped' ? 'bg-red-500' :
              alert.status.toLowerCase() === 'moving' ? 'bg-green-500' : 'bg-amber-500'
            }`}
          />
          <span className="text-gray-600">
            {t('status')}: <span className="font-medium text-gray-800">{alert.status}</span>
          </span>
        </div>
      )}

      {/* Reason */}
      {alert.reason && (
        <div className="text-sm text-gray-500 ml-7 leading-relaxed">
          <span className="text-gray-400">{t('reason')} </span>{alert.reason}
        </div>
      )}
    </div>
  );
}

const PLATFORM_MAP_ASPECT = MAP_VIEWBOX_WIDTH / MAP_VIEWBOX_HEIGHT;

interface PlatformSheetInfo {
  platform: string;
  /** Scheduled departure "HH:MM". */
  departure: string;
  /** Live delay minutes (0 when on time or unknown). */
  delayMin: number;
}

type GeoState =
  | { status: 'locating' | 'denied' | 'unavailable' }
  | { status: 'ok'; lat: number; lon: number };

const AT_STATION_METRES = 250;
const MAX_WALK_METRES = 3000;

function PlatformMapSheet({
  platform,
  departure,
  delayMin,
  onClose,
}: PlatformSheetInfo & {
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const mappedPlatforms = useMemo(() => getMappedPlatforms(platform), [platform]);
  const [zoomedIn, setZoomedIn] = useState(mappedPlatforms.length > 0);

  // Opening the sheet is an explicit tap on the platform badge, so it's an
  // acceptable moment to ask for location. watchPosition keeps the dot and
  // the leave-by estimate live while the sheet stays open.
  const [geo, setGeo] = useState<GeoState>({ status: 'locating' });
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeo({ status: 'unavailable' });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => setGeo({ status: 'ok', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => setGeo({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Re-render every 30s so "leave by" flips to "leave now" without a geo update.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const user = useMemo(
    () => (geo.status === 'ok' ? { lat: geo.lat, lon: geo.lon } : null),
    [geo]
  );
  const guidance = useMemo(
    () => buildOfficialGuidance(user, mappedPlatforms),
    [user, mappedPlatforms]
  );

  const walk = useMemo(() => {
    if (!user) return null;
    const distance = distanceToUnionMetres(user.lat, user.lon);
    const walkMin = estimateWalkMinutes(distance);
    const leaveBy = computeLeaveByMinutes(parseTime(departure) + delayMin, walkMin);
    return { distance, walkMin, leaveBy };
  }, [user, departure, delayMin]);

  const nowMin = torontoNow().minutes;
  const mustLeaveNow = walk != null && walk.distance > AT_STATION_METRES && nowMin >= walk.leaveBy;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md flex flex-col bg-gray-50 rounded-t-2xl max-h-[90vh]"
        style={{ boxShadow: '0 -4px 30px rgba(0,0,0,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/40 rounded-full" />

        {/* Sheet header */}
        <div className="bg-go-dark text-white px-4 pt-6 pb-4 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className={`min-w-11 h-11 px-1.5 rounded-xl flex items-center justify-center font-extrabold text-white shrink-0 bg-yellow-600/80 whitespace-nowrap leading-none ${
              mappedPlatforms.length > 1 ? 'text-sm' : 'text-lg'
            }`}>
              {formatPlatformLabel(platform)}
            </div>
            <div>
              <div className="font-bold text-base leading-tight">{t('platformMapTitle', { platform: formatPlatformLabel(platform) })}</div>
              <div className="text-white/60 text-xs">{t('platformMapSubtitle')}</div>
            </div>
            <button
              onClick={onClose}
              className="ml-auto w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pt-4 pb-2">
          <div className="bg-white rounded-xl border border-gray-200 p-2 mb-3">
            <div
              className="relative w-full overflow-hidden rounded-lg bg-gray-100 cursor-zoom-in"
              style={{ aspectRatio: PLATFORM_MAP_ASPECT }}
              onClick={(e) => { e.stopPropagation(); if (mappedPlatforms.length > 0) setZoomedIn((z) => !z); }}
            >
              <UnionPlatformMap
                highlightPlatforms={mappedPlatforms}
                zoomedIn={zoomedIn}
                guidance={guidance}
                className="w-full h-full"
              />

              {/* Zoom toggle */}
              {mappedPlatforms.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setZoomedIn((z) => !z); }}
                  className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow flex items-center gap-1"
                >
                  {zoomedIn ? (
                    <>🔍︎− {t('viewFullMap')}</>
                  ) : (
                    <>🔍︎+ {t('zoomToPlatform')}</>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Location + leave-by panel */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 mb-3">
            {geo.status === 'locating' && (
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <span className="animate-pulse">📍</span>
                {t('locating')}
              </div>
            )}
            {geo.status === 'denied' && (
              <div className="text-sm text-gray-500">{t('locationDenied')}</div>
            )}
            {geo.status === 'unavailable' && (
              <div className="text-sm text-gray-500">{t('locationUnavailable')}</div>
            )}
            {walk && (
              walk.distance <= AT_STATION_METRES ? (
                <div className="text-sm font-semibold text-green-700 flex items-center gap-2">
                  <span>✓</span>
                  {t('atStation')}
                </div>
              ) : walk.distance <= MAX_WALK_METRES ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-gray-800">
                      🚶 {t('walkEstimate', { min: walk.walkMin })}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {t('distanceAway', { km: (walk.distance / 1000).toFixed(1) })}
                    </div>
                  </div>
                  {mustLeaveNow ? (
                    <div className="px-3 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-extrabold animate-pulse">
                      {t('leaveNow')}
                    </div>
                  ) : (
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-blue-600">
                        {t('leaveBy')}
                      </div>
                      <div className="text-2xl font-black text-blue-700 tabular-nums leading-none mt-0.5">
                        {formatMinutesAsHHMM(walk.leaveBy)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  {t('distanceAway', { km: (walk.distance / 1000).toFixed(1) })}
                </div>
              )
            )}
          </div>

          {mappedPlatforms.length > 0 && guidance ? (
            <div className="bg-white rounded-xl border border-gray-200 p-3 mb-3 text-sm text-gray-700">
              {t('platformAccessHint', {
                platform: formatPlatformLabel(platform),
                entrance: guidance.entrance.description || guidance.entrance.name,
                concourse: guidance.access.concourse,
              })}
            </div>
          ) : mappedPlatforms.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 text-center">
              <div className="text-sm text-gray-600">{t('platformMapUnavailable')}</div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-4 pt-3 pb-6 border-t border-gray-200 bg-white rounded-none shrink-0">
          <div className="text-center text-xs text-gray-400">{t('platformMapSource')}</div>
        </div>
      </div>
    </div>
  );
}

function ServiceAlertsSheet({
  line,
  alerts,
  loading,
  available,
  lastUpdated,
  status,
  onClose,
}: {
  line: LineInfo;
  alerts: ParsedAlert[];
  loading: boolean;
  available: boolean;
  lastUpdated: string | null;
  status: LineStatus;
  onClose: () => void;
}) {
  const { lang, t } = useLanguage();
  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
    : null;
  const lineName = lineDisplayName(line, lang);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md flex flex-col bg-gray-50 rounded-t-2xl max-h-[90vh]"
        style={{ boxShadow: '0 -4px 30px rgba(0,0,0,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/40 rounded-full" />

        {/* Sheet header — GO dark green, matching app header */}
        <div className="bg-go-dark text-white px-4 pt-6 pb-4 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            {/* Line badge */}
            <div
              className="w-11 h-11 rounded-xl flex flex-col items-center justify-center font-extrabold text-white shrink-0"
              style={{ backgroundColor: line.color }}
            >
              <span className="text-xs leading-none">{line.id}</span>
            </div>
            <div>
              <div className="font-bold text-base leading-tight">{t('lineOption', { name: lineName })}</div>
              <div className="text-white/60 text-xs">{t('serviceUpdatesTitle')}</div>
            </div>
            <button
              onClick={onClose}
              className="ml-auto w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pt-4 pb-2">
          {loading ? (
            /* Loading state */
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-go-green border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500">{t('loadingServiceUpdates')}</span>
            </div>
          ) : !available ? (
            /* API unavailable */
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 text-center">
              <div className="text-gray-400 text-2xl mb-2">📡</div>
              <div className="text-sm font-medium text-gray-700 mb-1">{t('liveDataUnavailable')}</div>
              <div className="text-xs text-gray-500">{t('checkOfficialSite')}</div>
            </div>
          ) : (
            <>
              {status === 'noService' ? (
                /* No scheduled service today */
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <NoServiceIcon className="w-8 h-8 shrink-0" />
                    <div>
                      <div className="font-semibold text-gray-900">{t('noScheduledServiceToday')}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {t('noScheduledServiceDesc', { name: lineName })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : status === 'minor' ? (
                /* Minor delays */
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <MinorDelaysIcon className="w-8 h-8 shrink-0" />
                    <div>
                      <div className="font-semibold text-gray-900">{t('minorDelays')}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {t('minorDelaysDesc', { name: lineName })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : alerts.length === 0 ? (
                /* Good service */
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <CheckCircleIcon className="w-8 h-8 text-go-green shrink-0" />
                    <div>
                      <div className="font-semibold text-gray-900">{t('goodService')}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{t('noActiveAlerts', { name: lineName })}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Alert cards — shown alongside the status block above when present */}
              {alerts.map((alert, i) => <AlertCard key={i} alert={alert} />)}
            </>
          )}

        </div>

        {/* Footer */}
        <div className="px-4 pt-3 pb-6 border-t border-gray-200 bg-white rounded-none shrink-0">
          <a
            href={`https://www.gotransit.com/en/service-updates?mode=t&code=${line.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-go-green text-white font-semibold py-3 rounded-xl text-sm"
          >
            {t('viewOnGotransit')}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          {formattedTime && (
            <div className="text-center text-xs text-gray-400 mt-2">
              {t('lastUpdated', { time: formattedTime })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Station stop list (expandable inside TrainCard)
// ──────────────────────────────────────────────────────────

function StationList({
  stops,
  depMins,
  nowMinutes,
  delayMin,
  onBoard,
  isNext,
}: {
  stops: StationStop[];
  depMins: number;
  nowMinutes: number | null;
  /** Live delay — stop rows show scheduled times, so the position indicator
      compares against `now − delay` to stay on the delayed train's segment. */
  delayMin: number;
  onBoard: boolean;
  isNext: boolean;
}) {
  const { lang, t } = useLanguage();
  // For overnight trips (departure >22:00) normalize nowMinutes to absolute scale
  const effectiveNow = useMemo(() => {
    if (nowMinutes === null) return null;
    const adjusted = nowMinutes - delayMin;
    return adjusted < 360 && depMins > 1200 ? adjusted + 1440 : adjusted;
  }, [nowMinutes, depMins, delayMin]);

  // When On Board: find which segment we're currently in
  // "now" = between stop[i] and stop[i+1]
  // "nextStop" = stop[i+1] (the upcoming station)
  const nowSegmentAfterIndex = useMemo(() => {
    if (!onBoard || effectiveNow === null) return -1;
    for (let i = 0; i < stops.length - 1; i++) {
      if (effectiveNow >= stops[i].scheduledMinutes && effectiveNow < stops[i + 1].scheduledMinutes) {
        return i; // we're between stop[i] and stop[i+1]
      }
    }
    // If past last stop, we're at the final station
    return stops.length - 1;
  }, [onBoard, effectiveNow, stops]);

  return (
    <div className="relative pl-2 pr-1">
      {/* vertical track line */}
      <div className={`absolute left-[18px] top-3 bottom-3 w-0.5 ${isNext ? 'bg-white/20' : 'bg-gray-100'}`} />

      {stops.map((stop, i) => {
        const isFirst = i === 0;
        const isLast = i === stops.length - 1;

        // Passed = we've already left this station
        const isPassed = onBoard && nowSegmentAfterIndex >= 0 && i <= nowSegmentAfterIndex && nowSegmentAfterIndex < stops.length - 1;
        // "now" label: shown on the segment line BETWEEN stop[i] and stop[i+1]
        // We render it as a mid-segment indicator after stop[i] if we're currently between i and i+1
        const isInTransitAfter = onBoard && i === nowSegmentAfterIndex && nowSegmentAfterIndex < stops.length - 1;
        // "next" label: the upcoming station = stop[nowSegmentAfterIndex + 1]
        const isUpcomingStation = onBoard && i === nowSegmentAfterIndex + 1 && nowSegmentAfterIndex >= 0 && nowSegmentAfterIndex < stops.length - 1;
        // At final station
        const isAtFinal = onBoard && nowSegmentAfterIndex >= stops.length - 1 && isLast;

        return (
          <div key={stop.code} className="relative z-10">
            <div className="flex items-center gap-3 py-1.5">
              {/* dot */}
              <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center border-2 transition-all ${
                isAtFinal
                  ? 'bg-go-accent border-go-accent shadow-sm'
                  : isUpcomingStation
                  ? isNext ? 'bg-white border-white shadow-sm' : 'bg-go-dark border-go-dark shadow-sm'
                  : isPassed
                  ? isNext ? 'bg-white/40 border-white/40' : 'bg-go-green/40 border-go-green/40'
                  : isFirst || isLast
                  ? isNext ? 'bg-white border-white' : 'bg-go-dark border-go-dark'
                  : isNext ? 'bg-transparent border-white/40' : 'bg-white border-gray-300'
              }`}>
                {(isPassed && !isUpcomingStation && !isAtFinal) && (
                  <svg className={`w-2.5 h-2.5 ${isNext ? 'text-go-dark' : 'text-white'}`} fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                    <polyline points="2,6 5,9 10,3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {isAtFinal && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
              </div>

              {/* station name + time */}
              <div className="flex-1 flex justify-between items-center min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-sm truncate ${
                    isAtFinal
                      ? 'font-bold text-go-accent'
                      : isUpcomingStation
                      ? isNext ? 'text-white font-bold' : 'text-go-dark font-bold'
                      : isPassed
                      ? isNext ? 'text-white/40' : 'text-gray-400'
                      : isFirst || isLast
                      ? isNext ? 'text-white font-semibold' : 'text-go-dark font-semibold'
                      : isNext ? 'text-white/85' : 'text-gray-700'
                  }`}>
                    {getStationName(stop.code, stop.name, lang)}
                  </span>
                  {isUpcomingStation && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                      isNext ? 'bg-white/25 text-white' : 'bg-go-dark/10 text-go-dark'
                    }`}>
                      {t('next')}
                    </span>
                  )}
                  {isAtFinal && (
                    <span className="text-[10px] font-bold text-go-accent bg-go-accent/10 px-1.5 py-0.5 rounded-full shrink-0 animate-pulse">
                      {t('arrived')}
                    </span>
                  )}
                </div>
                <span className={`text-xs font-mono ml-2 shrink-0 ${
                  isAtFinal ? 'text-go-accent font-bold'
                  : isUpcomingStation ? isNext ? 'text-white font-bold' : 'text-go-dark font-bold'
                  : isPassed ? isNext ? 'text-white/35' : 'text-gray-300'
                  : isNext ? 'text-white/70' : 'text-gray-500'
                }`}>
                  {stop.scheduledTime}
                </span>
              </div>
            </div>

            {/* "now" indicator: mid-segment, shown after the departed station */}
            {isInTransitAfter && (
              <div className="flex items-center gap-3 py-0.5 relative z-10">
                {/* dot placeholder to align with track */}
                <div className="w-5 shrink-0 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse block" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 animate-pulse">
                  ← now
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VehicleBadge({
  type,
  isNext,
  isPast,
}: {
  type: 'train' | 'bus';
  isNext: boolean;
  isPast: boolean;
}) {
  const { t } = useLanguage();
  const iconCls = `w-7 h-6 ${
    isNext ? 'text-white' : isPast ? 'text-gray-300' : type === 'train' ? 'text-go-dark' : 'text-amber-600'
  }`;
  const textCls = `text-[9px] font-bold uppercase tracking-wider mt-0.5 ${
    isNext ? 'text-white/75' : isPast ? 'text-gray-300' : type === 'train' ? 'text-go-dark/70' : 'text-amber-600/80'
  }`;

  return (
    <div className="flex flex-col items-center justify-center w-10 shrink-0">
      {type === 'train' ? <TrainIcon className={iconCls} inverted={isNext} /> : <BusIcon className={iconCls} />}
      <span className={textCls}>{type === 'train' ? t('train') : t('bus')}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Departure countdown (NEXT card only)
// ──────────────────────────────────────────────────────────

// Chip colours per tone, tuned for the NEXT card's solid green background.
const COUNTDOWN_TONE_STYLES: Record<CountdownTone, { chip: string; label: string; value: string }> = {
  calm:   { chip: 'border-white/70 bg-white/10',      label: 'text-white/80',   value: 'text-white' },
  warn:   { chip: 'border-yellow-300 bg-yellow-300/15', label: 'text-yellow-200', value: 'text-yellow-100' },
  urgent: { chip: 'border-red-400 bg-red-500/25',     label: 'text-red-200',    value: 'text-red-50' },
};

// Live min:sec countdown to the expected departure — same chip shape as the
// platform badge. Self-contained 1s tick so only the chip re-renders; each
// tick recomputes from the wall clock, so a throttled background tab snaps
// back to the correct value on its first tick after resume. Tapping the chip
// itself opens the door-close note (no separate "i" button).
function CountdownChip({ departure, delayMin }: { departure: string; delayMin: number }) {
  const { t } = useLanguage();
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntilDeparture(departure, delayMin));
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    const tick = () => setSecondsLeft(secondsUntilDeparture(departure, delayMin));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [departure, delayMin]);

  const label = formatCountdown(secondsLeft);
  const tone = COUNTDOWN_TONE_STYLES[countdownTone(secondsLeft)];
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={t('boardingInfoLabel')}
        onClick={(e) => { e.stopPropagation(); setInfoOpen((o) => !o); }}
        className={`flex flex-col items-center leading-none px-2 py-1 rounded-lg border-[3px] transition-colors ${tone.chip}`}
      >
        <span className={`text-[8px] font-bold uppercase tracking-wide ${tone.label}`}>
          {t('departsIn')}
        </span>
        <span className={`font-black leading-none mt-0.5 tabular-nums ${tone.value} ${label.length > 5 ? 'text-lg' : 'text-2xl'}`}>
          {label}
        </span>
      </button>
      {infoOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setInfoOpen(false); }} />
          <div className="absolute bottom-full right-0 mb-2 w-56 bg-gray-800 text-gray-100 text-[11px] rounded-lg px-3 py-2 shadow-lg z-50 leading-relaxed">
            {t('doorCloseInfo')}
            <div className="absolute -bottom-1 right-1.5 w-2 h-2 bg-gray-800 rotate-45" />
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Train card
// ──────────────────────────────────────────────────────────

function TrackerRow({
  tracker,
  departure,
  isPast,
  isNext,
  showCountdown,
  showPlatform,
  direction,
  onPlatformClick,
}: {
  tracker: TrackerInfo | null;
  /** Scheduled departure "HH:MM" — countdown target is this + live delay. */
  departure: string;
  isPast: boolean;
  isNext: boolean;
  /** Countdown runs only on today's NEXT card (and never for a cancelled trip). */
  showCountdown: boolean;
  /** Platform is prominent only on the NOW/NEXT cards; elsewhere it stays
      hidden until the card is expanded (the data is still remembered). */
  showPlatform: boolean;
  direction: Direction;
  onPlatformClick: (platform: string) => void;
}) {
  const { t } = useLanguage();
  // Platform badge — outlined chip, the sharpest element on the card.
  // Only platforms departing Union (officeToHome) are on the Union platform
  // map; homeToOffice platform numbers belong to the home station instead.
  const isUnionPlatform = PLATFORM_MAP_ENABLED && direction === 'officeToHome' && tracker != null && isPlatformMapped(tracker.platform);
  const platformBadge = showPlatform && tracker?.platform ? (
    <div
      onClick={isUnionPlatform ? (e) => { e.stopPropagation(); onPlatformClick(tracker.platform); } : undefined}
      role={isUnionPlatform ? 'button' : undefined}
      className={`flex flex-col items-center leading-none px-2.5 py-1 rounded-lg border-[3px] ${
        isUnionPlatform ? 'cursor-pointer active:scale-95 transition-transform' : ''
      } ${
        isNext
          ? 'border-yellow-300 bg-yellow-300/10'
          : isPast
          ? 'border-yellow-200 bg-transparent'
          : 'border-yellow-500 bg-yellow-50'
      }`}
    >
      <span className={`text-[8px] font-bold uppercase tracking-wide ${
        isNext ? 'text-yellow-200' : isPast ? 'text-yellow-600/50' : 'text-yellow-700'
      }`}>
        {t('platform')}{isUnionPlatform ? ' 🗺️' : ''}
      </span>
      <span className={`text-2xl font-black leading-none mt-0.5 ${
        isNext ? 'text-yellow-100' : isPast ? 'text-yellow-700/50' : 'text-yellow-800'
      }`}>
        {formatPlatformLabel(tracker.platform)}
      </span>
    </div>
  ) : null;

  // Expected badge — same height/padding as platform badge
  const expectedBadge = !isPast && tracker?.expected ? (() => {
    if (tracker.cancelled) {
      return (
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
          isNext ? 'bg-red-500/25' : 'bg-red-100'
        }`}>
          <span className="text-sm leading-none">✕</span>
          <div className="flex flex-col leading-none">
            <span className={`text-[8px] font-semibold uppercase tracking-wide ${
              isNext ? 'text-red-200' : 'text-red-500'
            }`}>{t('status')}</span>
            <span className={`text-sm font-extrabold leading-none mt-0.5 ${
              isNext ? 'text-red-200' : 'text-red-600'
            }`}>{t('cancelled')}</span>
          </div>
        </div>
      );
    }
    if (tracker.delay > 0) {
      return (
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
          isNext ? 'bg-orange-400/25' : 'bg-orange-100'
        }`}>
          <span className="text-sm leading-none">⚠</span>
          <div className="flex flex-col leading-none">
            <span className={`text-[8px] font-semibold uppercase tracking-wide ${
              isNext ? 'text-orange-200' : 'text-orange-600'
            }`}>{t('delayed')}</span>
            <span className={`text-sm font-extrabold leading-none mt-0.5 ${
              isNext ? 'text-orange-200' : 'text-orange-700'
            }`}>{t('delayMin', { min: tracker.delay })}</span>
          </div>
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
        isNext ? 'bg-white/20' : 'bg-green-100'
      }`}>
        <span className="text-sm leading-none">✓</span>
        <div className="flex flex-col leading-none">
          <span className={`text-[8px] font-semibold uppercase tracking-wide ${
            isNext ? 'text-white/70' : 'text-green-600'
          }`}>{t('expected')}</span>
          <span className={`text-sm font-extrabold leading-none mt-0.5 ${
            isNext ? 'text-white/90' : 'text-green-700'
          }`}>{t('onTime')}</span>
        </div>
      </div>
    );
  })() : null;

  // Countdown to expected departure (scheduled + delay) — NEXT card only,
  // right-aligned after platform/expected. Tapping it reveals the door-close
  // note (see CountdownChip).
  const countdownChip = showCountdown && !tracker?.cancelled ? (
    <div className="ml-auto">
      <CountdownChip departure={departure} delayMin={tracker?.delay ?? 0} />
    </div>
  ) : null;

  if (!platformBadge && !expectedBadge && !countdownChip) return null;

  return (
    <div className={`flex items-center gap-1.5 mt-2 pt-2 ${
      isNext ? 'border-t border-white/20' : 'border-t border-gray-100'
    }`}>
      {platformBadge}
      {expectedBadge}
      {countdownChip}
    </div>
  );
}

function TrainCard({
  trip,
  isNext,
  isPast,
  alerts,
  tracker,
  direction,
  lineId,
  homeStationCode,
  nowMinutes,
  isToday,
  isExpanded,
  isOnBoard,
  liveStops,
  onToggleExpand,
  onToggleOnBoard,
  onAlertClick,
  onPlatformClick,
}: {
  trip: Trip;
  isNext: boolean;
  isPast: boolean;
  alerts: ParsedAlert[];
  tracker: TrackerInfo | null;
  direction: Direction;
  lineId: string;
  homeStationCode: string;
  nowMinutes: number | null;
  isToday: boolean;
  isExpanded: boolean;
  isOnBoard: boolean;
  liveStops: string[];
  onToggleExpand: () => void;
  onToggleOnBoard: () => void;
  onAlertClick: () => void;
  onPlatformClick: (platform: string) => void;
}) {
  const { t } = useLanguage();
  const hasAlert = alerts.length > 0;
  // Expected times: scheduled + live delay, so a delayed train's NOW window
  // (and on-board position) tracks when it actually runs.
  const delayMin = tracker?.delay ?? 0;
  const depMins = timeToMinutes(trip.departure) + delayMin;
  const arrMins = depMins + parseInt(trip.tripTime, 10);
  // A trip is "now running" only between its expected departure and arrival.
  // NOTE: isPast becomes true as soon as departure passes, so we must NOT include !isPast here.
  const isNowRunning = isToday && nowMinutes !== null && !tracker?.cancelled
    && nowMinutes >= depMins && nowMinutes <= arrMins;
  // For display: only gray out if truly past (arrived) AND not currently running
  const effectiveIsPast = isPast && !isNowRunning;
  // Show "On Board" only when trip is in progress
  const canOnBoard = isNowRunning;

  const stops = useMemo(
    () => getStops(lineId, trip, direction, homeStationCode, liveStops.length > 0 ? liveStops : undefined),
    [lineId, trip, direction, homeStationCode, liveStops]
  );

  return (
    <div className={`
      relative rounded-xl px-3 mb-2 transition-all overflow-hidden
      ${isNext
        ? 'bg-go-green shadow-md shadow-go-green/30 text-white'
        : isNowRunning
        ? 'bg-amber-50 text-gray-800 shadow-sm border border-amber-200'
        : effectiveIsPast
        ? 'bg-white/60 text-gray-400'
        : 'bg-white text-gray-800 shadow-sm'}
    `}>
      {/* Status badge row — sits flush at top, no overflow clipping issues */}
      {(isNext || isNowRunning) && (
        <div className="flex gap-1.5 pt-2 pb-0.5">
          {isNext && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-go-accent text-white px-2 py-0.5 rounded-full">
              {t('nextBadge')}
            </span>
          )}
          {isNowRunning && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-500 text-white px-2 py-0.5 rounded-full animate-pulse">
              {t('nowBadge')}
            </span>
          )}
        </div>
      )}

      {/* ── Clickable header row ── */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 pt-2 pb-3 text-left active:opacity-80"
      >
        {/* Vehicle badge */}
        <VehicleBadge type={trip.vehicleType} isNext={isNext} isPast={effectiveIsPast} />

        {/* Thin divider */}
        <div className={`w-px self-stretch ${isNext ? 'bg-white/20' : 'bg-gray-100'}`} />

        {/* Departure */}
        <div className="flex-1">
          <div className={`text-2xl font-bold leading-none ${isNext ? 'text-white' : isNowRunning ? 'text-amber-700' : 'text-go-dark'}`}>
            {trip.departure}
          </div>
          <div className={`text-xs mt-0.5 ${isNext ? 'text-white/75' : 'text-gray-500'}`}>{t('depart')}</div>
        </div>

        {/* Center arrow */}
        <div className="flex flex-col items-center px-1 gap-1">
          <div className={`text-xs font-medium ${isNext ? 'text-white/80' : 'text-gray-400'}`}>
            {trip.tripTime}
          </div>
          <div className="flex items-center gap-1">
            <div className={`h-px w-6 ${isNext ? 'bg-white/50' : 'bg-gray-200'}`} />
            <ArrowRightIcon className={`w-3 h-3 ${isNext ? 'text-white/70' : 'text-gray-300'}`} />
          </div>
        </div>

        {/* Arrival */}
        <div className="flex-1 text-right">
          <div className={`text-2xl font-bold leading-none ${isNext ? 'text-white' : isNowRunning ? 'text-go-dark' : 'text-go-dark'}`}>
            {trip.arrival}
          </div>
          <div className={`text-xs mt-0.5 ${isNext ? 'text-white/75' : 'text-gray-500'}`}>{t('arrive')}</div>
        </div>

        {/* Alert badge */}
        {hasAlert && (
          <div
            onClick={(e) => { e.stopPropagation(); onAlertClick(); }}
            role="button"
            className={`
              ml-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm
              ${isNext ? 'bg-white/20' : 'bg-amber-100'}
            `}
          >
            ⚠️
          </div>
        )}

        {/* Chevron */}
        <svg
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''} ${isNext ? 'text-white/60' : 'text-gray-400'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Tracker row: platform + expected + departure countdown. Platform chip
          visibility: always on NOW; on NEXT (live-only data, per platformFor);
          on past cards only when expanded via the chevron; NEVER on future
          cards below NEXT — even expanded — since no trustworthy platform can
          exist for them. Today's NEXT card always gets the row so the countdown
          runs even before any live tracker data arrives. */}
      {(tracker || (isNext && isToday)) && (
        <div className="pb-3">
          <TrackerRow
            tracker={tracker}
            departure={trip.departure}
            isPast={effectiveIsPast}
            isNext={isNext}
            showCountdown={isNext && isToday}
            showPlatform={isNext || isNowRunning || (effectiveIsPast && isExpanded)}
            direction={direction}
            onPlatformClick={onPlatformClick}
          />
        </div>
      )}

      {/* ── Expandable station list ── */}
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[500px] pb-3' : 'max-h-0'}`}>
        <div className={`border-t pt-3 ${isNext ? 'border-white/20' : 'border-gray-100'}`}>
          <StationList
            stops={stops}
            depMins={depMins}
            nowMinutes={nowMinutes}
            delayMin={delayMin}
            onBoard={isOnBoard}
            isNext={isNext}
          />

          {/* On Board button */}
          {canOnBoard && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleOnBoard(); }}
              className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold transition-all active:scale-98 ${
                isOnBoard
                  ? isNext
                    ? 'bg-white/20 text-white'
                    : 'bg-go-green/10 text-go-green border border-go-green/20'
                  : isNext
                    ? 'bg-white text-go-dark'
                    : 'bg-go-green text-white shadow-sm'
              }`}
            >
              {isOnBoard ? t('exitOnBoard') : t('onBoard')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Weekend notice
// ──────────────────────────────────────────────────────────

function WeekendNotice({ direction }: { direction: Direction }) {
  const { t } = useLanguage();
  const href = direction === 'homeToOffice'
    ? 'https://www.gotransit.com/en/see-schedules?tripPoint=36888&departure=UI&destination=UN&transfers=true'
    : 'https://www.gotransit.com/en/see-schedules?tripPoint=86388&departure=UN&destination=UI&transfers=true';

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-go-light flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-go-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 className="text-go-dark font-semibold text-lg mb-2">{t('noTrainsFound')}</h3>
      <p className="text-gray-500 text-sm mb-4">
        {t('noScheduledTrains')}<br />
        {t('viewOfficialSchedule')}
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-go-green text-white font-semibold px-5 py-2.5 rounded-full text-sm"
      >
        {t('seeWeekendSchedule')}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    </div>
  );
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

    </div>
  );
}
