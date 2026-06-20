'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  getScheduleForStation,
  getServiceType,
  getStops,
  timeToMinutes,
  type Direction,
  type Trip,
  type StationStop,
} from '@/lib/schedule-data';
import {
  LINES,
  getLine,
  getStation,
  DEFAULT_LINE_ID,
  type LineInfo,
  type StationInfo,
} from '@/lib/lines';
import type { ParsedAlert } from '@/app/api/alerts/route';
import type { TrackerTrip } from '@/app/api/tracker/route';
import { useLanguage, getStationName, type Lang } from '@/i18n';
import { PLATFORM_MAP_IMAGE, getPlatformZones, isPlatformMapped } from '@/lib/union-platform-map';

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDefaultDate(): string {
  return toLocalDateStr(new Date());
}

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalDateStr(d);
}

function getDefaultDirection(): Direction {
  return new Date().getHours() < 12 ? 'homeToOffice' : 'officeToHome';
}

function lineDisplayName(line: LineInfo, lang: Lang): string {
  return lang === 'zh' ? line.nameZh : line.name;
}

function parseTime(time: string): number {
  return timeToMinutes(time);
}

// ──────────────────────────────────────────────────────────
// Alert matching helpers
// ──────────────────────────────────────────────────────────

function buildAlertMap(alerts: ParsedAlert[], direction: Direction): Map<string, ParsedAlert[]> {
  const map = new Map<string, ParsedAlert[]>();
  for (const alert of alerts) {
    if (!alert.scheduledDeparture) continue;
    if (alert.direction !== 'both') {
      const expected = direction === 'officeToHome' ? 'northbound' : 'southbound';
      if (alert.direction !== expected) continue;
    }
    const key = alert.scheduledDeparture;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(alert);
  }
  return map;
}

// ──────────────────────────────────────────────────────────
// Tracker lookup helpers
// ──────────────────────────────────────────────────────────

interface TrackerInfo {
  platform: string;
  expected: string;
  delay: number;
  cancelled: boolean;
  arriveIn: string;
}

/**
 * Build lookup maps from tracker trips (source: railsix.com).
 * Both directions key by scheduledTime = departure from origin station:
 *  inbound  (SB) scheduledTime = departure from Unionville → match trip.departure
 *  outbound (NB) scheduledTime = departure from Union      → match trip.departure
 */
function buildTrackerMaps(trips: TrackerTrip[]): {
  inbound: Map<string, TrackerInfo>;
  outbound: Map<string, TrackerInfo>;
} {
  const inbound = new Map<string, TrackerInfo>();
  const outbound = new Map<string, TrackerInfo>();
  for (const t of trips) {
    const info: TrackerInfo = {
      platform: t.platform,
      expected: t.expected,
      delay: t.delay,
      cancelled: t.cancelled,
      arriveIn: t.arriveIn,
    };
    if (t.directionCd === 'Inbound') {
      inbound.set(t.scheduledTime, info);
    } else {
      outbound.set(t.scheduledTime, info);
    }
  }
  return { inbound, outbound };
}

function getTrackerInfo(
  trip: { departure: string; arrival: string },
  direction: Direction,
  inbound: Map<string, TrackerInfo>,
  outbound: Map<string, TrackerInfo>
): TrackerInfo | null {
  // railsix.com: scheduledTime = departure from origin for both directions
  if (direction === 'homeToOffice') return inbound.get(trip.departure) ?? null;
  return outbound.get(trip.departure) ?? null;
}

// ──────────────────────────────────────────────────────────
// Icons
// ──────────────────────────────────────────────────────────

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
    </svg>
  );
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

function PlatformMapSheet({
  platform,
  onClose,
}: {
  platform: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const zones = getPlatformZones(platform);

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
            <div className="w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-white shrink-0 bg-yellow-600/80 text-lg">
              {platform}
            </div>
            <div>
              <div className="font-bold text-base leading-tight">{t('platformMapTitle', { platform })}</div>
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
            <div className="relative w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PLATFORM_MAP_IMAGE} alt={t('platformMapSubtitle')} className="w-full rounded-lg" />
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
                >
                  <span className="absolute inline-flex h-5 w-5 -left-2.5 -top-2.5 rounded-full bg-yellow-500/60 animate-ping" />
                  <span className="relative block h-3 w-3 rounded-full bg-yellow-600 ring-2 ring-white" />
                </div>
              ))}
            </div>
          </div>

          {zones.length > 0 ? (
            zones.map((zone) => (
              <div key={zone.id} className="bg-white rounded-xl border border-gray-200 p-3 mb-3 text-sm text-gray-700">
                {t(zone.labelKey)}
              </div>
            ))
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 text-center">
              <div className="text-sm text-gray-600">{t('platformMapUnavailable')}</div>
            </div>
          )}
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
  onClose,
}: {
  line: LineInfo;
  alerts: ParsedAlert[];
  loading: boolean;
  available: boolean;
  lastUpdated: string | null;
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
          ) : (
            /* Alert cards */
            alerts.map((alert, i) => <AlertCard key={i} alert={alert} />)
          )}

          {/* Static special notice — Stouffville only (FIFA World Cup 2026) */}
          {!loading && line.id === 'ST' && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-go-light flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-go-green text-xs font-bold">i</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800 mb-1">{t('specialServiceNotice')}</div>
                  <div className="text-xs text-gray-600 leading-relaxed">
                    {t('specialServiceDetail')}
                  </div>
                </div>
              </div>
            </div>
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
  onBoard,
  isNext,
}: {
  stops: StationStop[];
  depMins: number;
  nowMinutes: number | null;
  onBoard: boolean;
  isNext: boolean;
}) {
  const { lang, t } = useLanguage();
  // For overnight trips (departure >22:00) normalize nowMinutes to absolute scale
  const effectiveNow = useMemo(() => {
    if (nowMinutes === null) return null;
    return nowMinutes < 360 && depMins > 1200 ? nowMinutes + 1440 : nowMinutes;
  }, [nowMinutes, depMins]);

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

// ──────────────────────────────────────────────────────────
// Vehicle type icons (GO Transit style)
// ──────────────────────────────────────────────────────────

function TrainIcon({ className, inverted }: { className?: string; inverted?: boolean }) {
  // "inverted" matches the app logo's white train body with dark green windows,
  // used when the icon itself renders in white (e.g. on a solid green card).
  const windowFill = inverted ? '#0b3d2c' : 'white';
  const windowOpacity = inverted ? 0.85 : 0.9;
  return (
    <svg viewBox="0 0 28 24" fill="currentColor" className={className} aria-hidden="true">
      {/* body -->*/}
      <rect x="2" y="4" width="24" height="14" rx="3" />
      {/* cab window -->*/}
      <rect x="17" y="6.5" width="6" height="5" rx="1" fill={windowFill} opacity={windowOpacity} />
      {/* side windows -->*/}
      <rect x="4" y="6.5" width="4" height="5" rx="1" fill={windowFill} opacity={windowOpacity} />
      <rect x="10" y="6.5" width="4" height="5" rx="1" fill={windowFill} opacity={windowOpacity} />
      {/* stripe -->*/}
      <rect x="2" y="13" width="24" height="2" fill={inverted ? '#0b3d2c' : 'white'} opacity={inverted ? 0.35 : 0.25} />
      {/* wheels -->*/}
      <circle cx="8" cy="20" r="2.5" />
      <circle cx="20" cy="20" r="2.5" />
      {/* rail -->*/}
      <rect x="0" y="22" width="28" height="1.5" rx="0.75" opacity="0.4" />
    </svg>
  );
}

function BusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 24" fill="currentColor" className={className} aria-hidden="true">
      {/* body -->*/}
      <rect x="2" y="2" width="24" height="17" rx="3" />
      {/* windshield -->*/}
      <rect x="4" y="4" width="20" height="6" rx="1.5" fill="white" opacity="0.9" />
      {/* side windows -->*/}
      <rect x="4" y="12" width="5" height="4" rx="1" fill="white" opacity="0.9" />
      <rect x="11.5" y="12" width="5" height="4" rx="1" fill="white" opacity="0.9" />
      <rect x="19" y="12" width="5" height="4" rx="1" fill="white" opacity="0.9" />
      {/* wheels -->*/}
      <circle cx="8" cy="21" r="2.5" />
      <circle cx="20" cy="21" r="2.5" />
      {/* undercarriage -->*/}
      <rect x="2" y="18" width="24" height="1.5" opacity="0.3" />
    </svg>
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
// Train card
// ──────────────────────────────────────────────────────────

function TrackerRow({
  tracker,
  isPast,
  isNext,
  direction,
  onPlatformClick,
}: {
  tracker: TrackerInfo;
  isPast: boolean;
  isNext: boolean;
  direction: Direction;
  onPlatformClick: (platform: string) => void;
}) {
  const { t } = useLanguage();
  // Platform badge — outlined chip, the sharpest element on the card.
  // Only platforms departing Union (officeToHome) are on the Union platform
  // map; homeToOffice platform numbers belong to the home station instead.
  const isUnionPlatform = direction === 'officeToHome' && isPlatformMapped(tracker.platform);
  const platformBadge = tracker.platform ? (
    <div
      onClick={isUnionPlatform ? (e) => { e.stopPropagation(); onPlatformClick(tracker.platform); } : undefined}
      role={isUnionPlatform ? 'button' : undefined}
      className={`flex flex-col items-center leading-none px-3.5 py-1 rounded-lg border-[3px] ${
        isUnionPlatform ? 'cursor-pointer active:scale-95 transition-transform' : ''
      } ${
        isNext
          ? 'border-yellow-300 bg-yellow-300/10'
          : isPast
          ? 'border-yellow-200 bg-transparent'
          : 'border-yellow-500 bg-yellow-50'
      }`}
    >
      <span className={`text-[9px] font-bold uppercase tracking-wider ${
        isNext ? 'text-yellow-200' : isPast ? 'text-yellow-600/50' : 'text-yellow-700'
      }`}>
        {t('platform')}{isUnionPlatform ? ' 🗺️' : ''}
      </span>
      <span className={`text-3xl font-black leading-none mt-0.5 ${
        isNext ? 'text-yellow-100' : isPast ? 'text-yellow-700/50' : 'text-yellow-800'
      }`}>
        {tracker.platform.split(/[,/]/).map((p) => p.trim()).filter(Boolean).join(' ')}
      </span>
    </div>
  ) : null;

  // Expected badge — same height/padding as platform badge
  const expectedBadge = !isPast && tracker.expected ? (() => {
    if (tracker.cancelled) {
      return (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${
          isNext ? 'bg-red-500/25' : 'bg-red-100'
        }`}>
          <span className="text-base leading-none">✕</span>
          <div className="flex flex-col leading-none">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${
              isNext ? 'text-red-200' : 'text-red-500'
            }`}>{t('status')}</span>
            <span className={`text-base font-extrabold leading-none mt-0.5 ${
              isNext ? 'text-red-200' : 'text-red-600'
            }`}>{t('cancelled')}</span>
          </div>
        </div>
      );
    }
    if (tracker.delay > 0) {
      return (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${
          isNext ? 'bg-orange-400/25' : 'bg-orange-100'
        }`}>
          <span className="text-base leading-none">⚠</span>
          <div className="flex flex-col leading-none">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${
              isNext ? 'text-orange-200' : 'text-orange-600'
            }`}>{t('delayed')}</span>
            <span className={`text-base font-extrabold leading-none mt-0.5 ${
              isNext ? 'text-orange-200' : 'text-orange-700'
            }`}>{t('delayMin', { min: tracker.delay })}</span>
          </div>
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${
        isNext ? 'bg-white/20' : 'bg-green-100'
      }`}>
        <span className="text-base leading-none">✓</span>
        <div className="flex flex-col leading-none">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${
            isNext ? 'text-white/70' : 'text-green-600'
          }`}>{t('expected')}</span>
          <span className={`text-base font-extrabold leading-none mt-0.5 ${
            isNext ? 'text-white/90' : 'text-green-700'
          }`}>{t('onTime')}</span>
        </div>
      </div>
    );
  })() : null;

  if (!platformBadge && !expectedBadge) return null;

  return (
    <div className={`flex items-center gap-2 mt-2 pt-2 ${
      isNext ? 'border-t border-white/20' : 'border-t border-gray-100'
    }`}>
      {platformBadge}
      {expectedBadge}
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
  const depMins = timeToMinutes(trip.departure);
  const arrMins = depMins + parseInt(trip.tripTime, 10);
  // A trip is "now running" if we're between departure and arrival (±5 min grace).
  // NOTE: isPast becomes true as soon as departure passes, so we must NOT include !isPast here.
  const isNowRunning = isToday && nowMinutes !== null
    && nowMinutes >= depMins - 5 && nowMinutes <= arrMins + 5;
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

      {/* Tracker row: platform + expected */}
      {tracker && (
        <div className="pb-3">
          <TrackerRow tracker={tracker} isPast={effectiveIsPast} isNext={isNext} direction={direction} onPlatformClick={onPlatformClick} />
        </div>
      )}

      {/* ── Expandable station list ── */}
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[500px] pb-3' : 'max-h-0'}`}>
        <div className={`border-t pt-3 ${isNext ? 'border-white/20' : 'border-gray-100'}`}>
          <StationList
            stops={stops}
            depMins={depMins}
            nowMinutes={nowMinutes}
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
// Install (Add to Home Screen) detection + sheet
// ──────────────────────────────────────────────────────────

type InstallPlatform = 'ios' | 'android' | 'desktop-chromium' | 'other';

function detectInstallPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  // All iOS browsers (Safari, Chrome, Firefox, Edge) can add to the Home
  // Screen via their Share/menu icon, so treat every iOS browser the same.
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Chrome|Edg|Chromium/.test(ua) && !/Firefox/.test(ua)) return 'desktop-chromium';
  return 'other';
}

function useInstallPrompt() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>('other');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
    setPlatform(detectInstallPlatform());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return { isStandalone, platform, deferredPrompt, install };
}

function InstallSheet({
  platform,
  deferredPrompt,
  install,
  onClose,
}: {
  platform: InstallPlatform;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deferredPrompt: any;
  install: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();

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
            <div className="font-bold text-base leading-tight">{t('installSheetTitle')}</div>
            <button
              onClick={onClose}
              className="ml-auto w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-4 pt-4 pb-6">
          {deferredPrompt ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-sm text-gray-600 mb-3">{t('getQuickAccess')}</div>
              <button
                onClick={install}
                className="w-full bg-go-green text-white font-semibold py-3 rounded-xl text-sm"
              >
                {t('install')}
              </button>
            </div>
          ) : platform === 'ios' ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm text-gray-700 font-medium mb-3 text-center">{t('tapShareThenAdd')}</div>
              <div className="flex items-center justify-center gap-6">
                {[
                  { icon: '⬆️', label: t('stepTapShare') },
                  { icon: '➕', label: t('stepAddToHomeScreen') },
                  { icon: '✅', label: t('stepDone') },
                ].map((step, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="text-2xl leading-none">{step.icon}</span>
                    <span className="text-[11px] text-gray-500 text-center leading-tight">{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : platform === 'android' ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-700 leading-relaxed">
              {t('installAndroidSteps')}
            </div>
          ) : platform === 'desktop-chromium' ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-700 leading-relaxed">
              {t('installDesktopSteps')}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-700 leading-relaxed">
              {t('installUnsupported')}
            </div>
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

const LINE_STORAGE_KEY = 'go-train-line';
const HOME_STATION_STORAGE_KEY = 'go-train-home-station';

// Home station is remembered per line: "go-train-home-station:LW".
// The un-suffixed key is the legacy Stouffville-only key (pre multi-line).
function homeStationKey(lineId: string): string {
  return `${HOME_STATION_STORAGE_KEY}:${lineId}`;
}

// Resolve the saved (or default) home station for a line, validating it against
// the line's stations and migrating pre-GTFS Stouffville codes.
function loadHomeStation(line: LineInfo): string {
  if (typeof window === 'undefined') return line.defaultHomeCode;
  let stored = localStorage.getItem(homeStationKey(line.id));
  if (!stored && line.id === 'ST') stored = localStorage.getItem(HOME_STATION_STORAGE_KEY);
  const migration: Record<string, string> = { OE: 'LI', ER: 'ST', ML: 'MK', AO: 'AG', CN: 'CE', MK: 'MR' };
  const code = stored ? (migration[stored] ?? stored) : line.defaultHomeCode;
  return line.homeStations.some((s) => s.code === code) ? code : line.defaultHomeCode;
}

function loadLineId(): string {
  if (typeof window === 'undefined') return DEFAULT_LINE_ID;
  const stored = localStorage.getItem(LINE_STORAGE_KEY) ?? DEFAULT_LINE_ID;
  return LINES.some((l) => l.id === stored) ? stored : DEFAULT_LINE_ID;
}

export default function Home() {
  const { lang, setLang, t } = useLanguage();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [selectedDate, setSelectedDate] = useState(getDefaultDate);
  const [direction, setDirection] = useState<Direction>(getDefaultDirection);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  const [todayStr, setTodayStr] = useState<string>('');

  // Active line + home station, both persisted (home station per line).
  const [lineId, setLineId] = useState<string>(loadLineId);
  const line: LineInfo = getLine(lineId);
  const [homeStationCode, setHomeStationCode] = useState<string>(() => loadHomeStation(getLine(loadLineId())));
  const homeStation: StationInfo = getStation(lineId, homeStationCode);

  // Switching line: remember the choice and restore that line's home station.
  const handleLineChange = useCallback((newLineId: string) => {
    setLineId(newLineId);
    setHomeStationCode(loadHomeStation(getLine(newLineId)));
  }, []);

  useEffect(() => {
    localStorage.setItem(LINE_STORAGE_KEY, lineId);
  }, [lineId]);

  useEffect(() => {
    localStorage.setItem(homeStationKey(lineId), homeStationCode);
  }, [lineId, homeStationCode]);

  // Tracker state (platform + expected)
  const [trackerTrips, setTrackerTrips] = useState<TrackerTrip[]>([]);

  // Clear stale tracker data immediately when line or home station changes
  useEffect(() => {
    setTrackerTrips([]);
    setLastRefreshed(null);
  }, [lineId, homeStationCode]);

  // Alerts state
  const [alerts, setAlerts] = useState<ParsedAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsAvailable, setAlertsAvailable] = useState(false);
  const [alertsLastUpdated, setAlertsLastUpdated] = useState<string | null>(null);
  const [showAlertsSheet, setShowAlertsSheet] = useState(false);
  const [platformSheet, setPlatformSheet] = useState<string | null>(null);
  const [showInstallSheet, setShowInstallSheet] = useState(false);
  const installPrompt = useInstallPrompt();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState(30);
  const [expandedDep, setExpandedDep] = useState<string | null>(null);
  const [onBoardDep, setOnBoardDep] = useState<string | null>(null);

  // Clock tick
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
      setTodayStr(toLocalDateStr(now));
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  // Fetch tracker (platform + expected) every 30 seconds
  const fetchTracker = useCallback(async () => {
    try {
      const res = await fetch(`/api/tracker?home=${homeStation.railsixSlug}`);
      if (!res.ok) return;
      const data = await res.json();
      setTrackerTrips(data.trips ?? []);
      setLastRefreshed(new Date());
      setRefreshCountdown(30);
    } catch {
      // non-critical
    }
  }, [homeStation.railsixSlug]);

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

  const trips: Trip[] = useMemo(
    () => getScheduleForStation(lineId, direction, serviceType, homeStationCode),
    [lineId, direction, serviceType, homeStationCode]
  );

  const isToday = selectedDate === todayStr;

  const nextIndex = useMemo(() => {
    if (!isToday || nowMinutes === null) return -1;
    return trips.findIndex((t) => parseTime(t.departure) >= nowMinutes);
  }, [trips, isToday, nowMinutes]);

  const alertMap = useMemo(
    () => buildAlertMap(alerts, direction),
    [alerts, direction]
  );

  // Tracker lookup maps
  const { inbound: trackerInbound, outbound: trackerOutbound } = useMemo(
    () => buildTrackerMaps(trackerTrips),
    [trackerTrips]
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

  // For today: scroll to next train. For other dates: scroll to first train at/after 8am.
  const scrollTargetIndex = useMemo(() => {
    if (isToday) return nextIndex;
    const idx = trips.findIndex((t) => parseTime(t.departure) >= 480); // 8:00
    return idx >= 0 ? idx : 0;
  }, [isToday, nextIndex, trips]);

  // Auto-scroll whenever the visible schedule changes
  useEffect(() => {
    if (scrollTargetIndex < 0) return;
    const t = setTimeout(() => {
      const el = document.getElementById('scroll-target');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => clearTimeout(t);
  }, [scrollTargetIndex, selectedDate, direction]);

  // Collapse expanded cards when switching line, date or direction
  useEffect(() => {
    setExpandedDep(null);
    setOnBoardDep(null);
  }, [lineId, selectedDate, direction]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col max-w-md mx-auto">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-go-dark text-white shadow-lg">
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

            {/* Service alerts icon — always visible */}
            <button
              onClick={() => setShowAlertsSheet(true)}
              className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title={t('serviceUpdates', { name: lineDisplayName(line, lang) })}
            >
              <BellIcon className="w-5 h-5 text-white/70" />
              {/* Badge dot — red when alerts, amber when loading done */}
              {!alertsLoading && totalAlerts > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-go-dark" />
              )}
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

            {!installPrompt.isStandalone && (
              <>
                <div className="w-px h-4 bg-white/20" />

                {/* Install button */}
                <button
                  onClick={() => setShowInstallSheet(true)}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  title={t('install')}
                >
                  <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Line picker */}
        <div className="flex items-center gap-2 mx-4 mb-2">
          <span className="text-white/60 text-xs shrink-0 w-14 flex items-center gap-1.5">
            <span className="w-4 flex items-center justify-center shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-go-green" />
            </span>
            {t('lineLabel')}
          </span>
          <div className="relative flex-1">
            <select
              value={lineId}
              onChange={(e) => handleLineChange(e.target.value)}
              className="w-full bg-white/10 text-white text-xs rounded-lg pl-2 pr-7 py-1.5 border border-white/20 focus:outline-none focus:border-white/50 appearance-none"
            >
              {LINES.map((l) => (
                <option key={l.id} value={l.id} className="bg-go-dark text-white">
                  {t('lineOption', { name: lineDisplayName(l, lang) })}
                </option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Home station picker */}
        <div className="flex items-center gap-2 mx-4 mb-2">
          <span className="text-white/60 text-xs shrink-0 w-14 flex items-center gap-1.5">
            <span className="w-4 flex items-center justify-center shrink-0">🏠</span>
            {t('homeLabel')}
          </span>
          <div className="relative flex-1">
            <select
              value={homeStationCode}
              onChange={(e) => setHomeStationCode(e.target.value)}
              className="w-full bg-white/10 text-white text-xs rounded-lg pl-2 pr-7 py-1.5 border border-white/20 focus:outline-none focus:border-white/50 appearance-none"
            >
              {line.homeStations.map((s) => (
                <option key={s.code} value={s.code} className="bg-go-dark text-white">
                  {getStationName(s.code, s.name, lang)}
                </option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Direction tabs */}
        <div className="flex mx-4 mb-3 bg-white/10 rounded-xl p-1 gap-1">
          <button
            onClick={() => setDirection('homeToOffice')}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-semibold transition-all ${
              direction === 'homeToOffice' ? 'bg-go-green text-white shadow' : 'text-white/70'
            }`}
          >
            <div className="text-xs leading-tight">🏠 {getStationName(homeStation.code, homeStation.shortName, lang)}</div>
            <div className="text-xs text-white/60">{t('homeToUnion')}</div>
          </button>
          <button
            onClick={() => setDirection('officeToHome')}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-semibold transition-all ${
              direction === 'officeToHome' ? 'bg-go-green text-white shadow' : 'text-white/70'
            }`}
          >
            <div className="text-xs leading-tight">🏢 {t('unionShort')}</div>
            <div className="text-xs text-white/60">{t('unionToHome', { home: getStationName(homeStation.code, homeStation.shortName, lang) })}</div>
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
              className="w-full h-9 bg-white/10 text-white text-sm rounded-lg pl-8 pr-2 border border-white/20 focus:outline-none focus:border-white/50"
            />
          </div>
          {isToday ? (
            <button
              key="tomorrow-btn"
              onClick={() => {
                setSelectedDate(getTomorrowStr());
                setDirection('homeToOffice');
              }}
              className="shrink-0 h-9 bg-white/10 text-white text-xs font-semibold px-3 rounded-lg border border-white/20 hover:bg-white/20 transition-colors"
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
              className="shrink-0 h-9 bg-go-accent text-white text-xs font-semibold px-3 rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('today')}
            </button>
          )}
        </div>
      </header>

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

      {/* Train list */}
      <main className="flex-1 px-3 py-3 overflow-y-auto">
        {trips.length === 0 ? (
          <WeekendNotice direction={direction} />
        ) : (
          <>
            {trips.map((trip, i) => {
              const isPast = isToday && nowMinutes !== null && parseTime(trip.departure) < nowMinutes;
              const isNext = i === nextIndex;
              const tripAlerts = alertMap.get(trip.departure) ?? [];
              const tracker = isToday ? getTrackerInfo(trip, direction, trackerInbound, trackerOutbound) : null;
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
                    onPlatformClick={(platform) => setPlatformSheet(platform)}
                  />
                </div>
              );
            })}

            {/* Live data status footer */}
            <div className="mt-4 mb-2 mx-1 rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-3">
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
            </div>

            <div className="text-center text-xs text-gray-400 mt-3 mb-2 pb-safe">
              {t('scheduleEffective', { date: line.effectiveDate, name: lineDisplayName(line, lang) })}
              <br />
              <a
                href="https://github.com/jasonzzx/go-train-status/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="underline mt-1 inline-block"
              >
                {t('reportIssues')}
              </a>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-8 pb-safe">
              <img
                src="/personal-icons/JASON_LOGO_512.png"
                alt="Jason Zhong logo"
                className="w-5 h-5 rounded-full"
              />
              <span>{t('authorBy')}</span>
              <a
                href="mailto:jasonzzx@gmail.com"
                title="Email Jason Zhong"
                aria-label="Email Jason Zhong"
                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 hover:bg-go-light hover:text-go-green transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            </div>
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
          onClose={() => setShowAlertsSheet(false)}
        />
      )}

      {/* Platform Map Sheet */}
      {platformSheet && (
        <PlatformMapSheet platform={platformSheet} onClose={() => setPlatformSheet(null)} />
      )}

      {/* Install Sheet */}
      {showInstallSheet && (
        <InstallSheet
          platform={installPrompt.platform}
          deferredPrompt={installPrompt.deferredPrompt}
          install={installPrompt.install}
          onClose={() => setShowInstallSheet(false)}
        />
      )}
    </div>
  );
}
