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
            Scheduled:{' '}
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
            Status: <span className="font-medium text-gray-800">{alert.status}</span>
          </span>
        </div>
      )}

      {/* Reason */}
      {alert.reason && (
        <div className="text-sm text-gray-500 ml-7 leading-relaxed">
          <span className="text-gray-400">Reason: </span>{alert.reason}
        </div>
      )}
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
  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
    : null;

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
              <div className="font-bold text-base leading-tight">{line.name} Line</div>
              <div className="text-white/60 text-xs">Service Updates</div>
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
              <span className="text-sm text-gray-500">Loading service updates…</span>
            </div>
          ) : !available ? (
            /* API unavailable */
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 text-center">
              <div className="text-gray-400 text-2xl mb-2">📡</div>
              <div className="text-sm font-medium text-gray-700 mb-1">Live data unavailable</div>
              <div className="text-xs text-gray-500">Check the official GO Transit website for current alerts.</div>
            </div>
          ) : alerts.length === 0 ? (
            /* Good service */
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="w-8 h-8 text-go-green shrink-0" />
                <div>
                  <div className="font-semibold text-gray-900">Good Service</div>
                  <div className="text-xs text-gray-500 mt-0.5">No active alerts on {line.name} line</div>
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
                  <div className="text-sm font-semibold text-gray-800 mb-1">Special service Jun 10 – Jul 5</div>
                  <div className="text-xs text-gray-600 leading-relaxed">
                    Extra weekday trip added: Unionville GO{' '}
                    <span className="font-mono font-semibold">16:36</span> → Union Station{' '}
                    <span className="font-mono font-semibold">17:17</span> (FIFA World Cup 2026).
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
            View on gotransit.com
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          {formattedTime && (
            <div className="text-center text-xs text-gray-400 mt-2">
              Last updated {formattedTime}
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
                    {stop.name}
                  </span>
                  {isUpcomingStation && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                      isNext ? 'bg-white/25 text-white' : 'bg-go-dark/10 text-go-dark'
                    }`}>
                      next
                    </span>
                  )}
                  {isAtFinal && (
                    <span className="text-[10px] font-bold text-go-accent bg-go-accent/10 px-1.5 py-0.5 rounded-full shrink-0 animate-pulse">
                      arrived
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
  const iconCls = `w-7 h-6 ${
    isNext ? 'text-white' : isPast ? 'text-gray-300' : type === 'train' ? 'text-go-dark' : 'text-amber-600'
  }`;
  const textCls = `text-[9px] font-bold uppercase tracking-wider mt-0.5 ${
    isNext ? 'text-white/75' : isPast ? 'text-gray-300' : type === 'train' ? 'text-go-dark/70' : 'text-amber-600/80'
  }`;

  return (
    <div className="flex flex-col items-center justify-center w-10 shrink-0">
      {type === 'train' ? <TrainIcon className={iconCls} inverted={isNext} /> : <BusIcon className={iconCls} />}
      <span className={textCls}>{type === 'train' ? 'Train' : 'Bus'}</span>
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
}: {
  tracker: TrackerInfo;
  isPast: boolean;
  isNext: boolean;
}) {
  // Platform badge — outlined chip, the sharpest element on the card
  const platformBadge = tracker.platform ? (
    <div className={`flex flex-col items-center leading-none px-3.5 py-1 rounded-lg border-[3px] ${
      isNext
        ? 'border-yellow-300 bg-yellow-300/10'
        : isPast
        ? 'border-yellow-200 bg-transparent'
        : 'border-yellow-500 bg-yellow-50'
    }`}>
      <span className={`text-[9px] font-bold uppercase tracking-wider ${
        isNext ? 'text-yellow-200' : isPast ? 'text-yellow-600/50' : 'text-yellow-700'
      }`}>
        Platform
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
            }`}>Status</span>
            <span className={`text-base font-extrabold leading-none mt-0.5 ${
              isNext ? 'text-red-200' : 'text-red-600'
            }`}>Cancelled</span>
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
            }`}>Delayed</span>
            <span className={`text-base font-extrabold leading-none mt-0.5 ${
              isNext ? 'text-orange-200' : 'text-orange-700'
            }`}>+{tracker.delay} min</span>
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
          }`}>Expected</span>
          <span className={`text-base font-extrabold leading-none mt-0.5 ${
            isNext ? 'text-white/90' : 'text-green-700'
          }`}>On Time</span>
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
}) {
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
              Next
            </span>
          )}
          {isNowRunning && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-500 text-white px-2 py-0.5 rounded-full animate-pulse">
              Now
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
          <div className={`text-xs mt-0.5 ${isNext ? 'text-white/75' : 'text-gray-500'}`}>depart</div>
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
          <div className={`text-xs mt-0.5 ${isNext ? 'text-white/75' : 'text-gray-500'}`}>arrive</div>
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
          <TrackerRow tracker={tracker} isPast={effectiveIsPast} isNext={isNext} />
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
              {isOnBoard ? '✕ Exit On Board' : '🚆 On Board'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Add to Home Screen banner
// ──────────────────────────────────────────────────────────

function AddToHomeScreenBanner() {
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Already running as installed PWA — hide banner
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // User already dismissed this session
    if (sessionStorage.getItem('a2hs-dismissed')) return;

    const ua = navigator.userAgent;
    // iOS Safari (not Chrome/Firefox on iOS)
    const iosDevice = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua) && /Safari/.test(ua);

    if (iosDevice) {
      setIsIOS(true);
      setVisible(true);
      return;
    }

    // Android / Desktop Chrome — capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    sessionStorage.setItem('a2hs-dismissed', '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="mx-3 mt-3 mb-1 rounded-2xl overflow-hidden shadow-sm border border-green-100"
         style={{ background: 'linear-gradient(135deg, #0d4030 0%, #082b20 100%)' }}>
      <div className="flex items-start gap-3 px-4 py-3">
        {/* App icon */}
        <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden shadow-md p-1"
             style={{ background: '#082b20', border: '1.5px solid rgba(255,255,255,0.15)' }}>
          <svg viewBox="0 0 36 36" width="100%" height="100%">
            <defs>
              <linearGradient id="a2hsLogoRim" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#e8fff0" />
                <stop offset="0.3" stopColor="#7ED957" />
                <stop offset="0.55" stopColor="#0b3d2c" />
                <stop offset="0.8" stopColor="#7ED957" />
                <stop offset="1" stopColor="#e8fff0" />
              </linearGradient>
            </defs>
            <circle cx="18" cy="18" r="16.4" fill="none" stroke="url(#a2hsLogoRim)" strokeWidth="1.6" />
            <circle cx="18" cy="18" r="14.4" fill="#00853F" />
            <g transform="translate(18,18) scale(0.8) translate(-18,-18)">
              <rect x="6" y="13" width="24" height="10" rx="2.5" fill="white" />
              <rect x="22" y="15" width="6" height="5" rx="1" fill="#0b3d2c" opacity="0.85" />
              <rect x="8" y="15" width="4" height="3.5" rx="0.8" fill="#0b3d2c" opacity="0.85" />
              <rect x="14" y="15" width="4" height="3.5" rx="0.8" fill="#0b3d2c" opacity="0.85" />
              <circle cx="11" cy="25" r="2.5" fill="white" />
              <circle cx="25" cy="25" r="2.5" fill="white" />
              <rect x="4" y="27" width="28" height="1.5" rx="0.75" fill="white" opacity="0.45" />
              <circle cx="29" cy="9" r="4" fill="#0b3d2c" />
              <circle cx="29" cy="9" r="2.5" fill="#4ade80" />
            </g>
          </svg>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm leading-snug">Add to Home Screen</div>
          {isIOS ? (
            <div className="text-white/60 text-xs mt-0.5 leading-relaxed">
              Tap the{' '}
              <span className="inline-flex items-center gap-0.5 text-white/80 font-medium">
                <svg className="w-3 h-3 inline" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707A1 1 0 016.293 5.293l3-3A1 1 0 0110 2z"/>
                  <path d="M3 15a2 2 0 002 2h10a2 2 0 002-2v-4a1 1 0 10-2 0v4H5v-4a1 1 0 10-2 0v4z"/>
                </svg>
                Share
              </span>
              {' '}then{' '}
              <span className="text-white/80 font-medium">"Add to Home Screen"</span>
            </div>
          ) : (
            <div className="text-white/60 text-xs mt-0.5">Get quick access from your home screen</div>
          )}
        </div>

        {/* Action / dismiss */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstall}
              className="bg-go-accent text-white text-xs font-bold px-3 py-1.5 rounded-lg active:opacity-80"
            >
              Install
            </button>
          )}
          <button
            onClick={dismiss}
            className="text-white/40 hover:text-white/70 text-xs px-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>

      {/* iOS step hint strip */}
      {isIOS && (
        <div className="flex items-center justify-center gap-4 pb-3 px-4">
          {[
            { icon: '⬆️', label: 'Tap Share' },
            { icon: '➕', label: 'Add to Home Screen' },
            { icon: '✅', label: 'Done!' },
          ].map((step, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span className="text-lg leading-none">{step.icon}</span>
              <span className="text-[9px] text-white/50 text-center leading-tight">{step.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Weekend notice
// ──────────────────────────────────────────────────────────

function WeekendNotice({ direction }: { direction: Direction }) {
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
      <h3 className="text-go-dark font-semibold text-lg mb-2">No Trains Found</h3>
      <p className="text-gray-500 text-sm mb-4">
        No scheduled trains for this station on this date.<br />
        View the official schedule on gotransit.com.
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-go-green text-white font-semibold px-5 py-2.5 rounded-full text-sm"
      >
        See Weekend Schedule
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
            <div className="font-bold text-base leading-tight">Go Train Status</div>
            <div className="text-white/60 text-xs">{line.name} Line</div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Service alerts icon — always visible */}
            <button
              onClick={() => setShowAlertsSheet(true)}
              className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title={`${line.name} service updates`}
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
              title="Refresh live data"
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

            <div className="w-px h-4 bg-white/20" />

            <a
              href={
                direction === 'homeToOffice'
                  ? `https://www.gotransit.com/en/see-schedules?departure=${homeStation.code}&destination=UN&transfers=true`
                  : `https://www.gotransit.com/en/see-schedules?departure=UN&destination=${homeStation.code}&transfers=true`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 text-xs hover:text-white/90 transition-colors"
            >
              Official ↗
            </a>
          </div>
        </div>

        {/* Line picker */}
        <div className="flex items-center gap-2 mx-4 mb-2">
          <span className="text-white/60 text-xs shrink-0 w-14 flex items-center gap-1.5">
            <span className="w-4 flex items-center justify-center shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-go-green" />
            </span>
            Line
          </span>
          <div className="relative flex-1">
            <select
              value={lineId}
              onChange={(e) => handleLineChange(e.target.value)}
              className="w-full bg-white/10 text-white text-xs rounded-lg pl-2 pr-7 py-1.5 border border-white/20 focus:outline-none focus:border-white/50 appearance-none"
            >
              {LINES.map((l) => (
                <option key={l.id} value={l.id} className="bg-go-dark text-white">
                  {l.name} Line
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
            Home
          </span>
          <div className="relative flex-1">
            <select
              value={homeStationCode}
              onChange={(e) => setHomeStationCode(e.target.value)}
              className="w-full bg-white/10 text-white text-xs rounded-lg pl-2 pr-7 py-1.5 border border-white/20 focus:outline-none focus:border-white/50 appearance-none"
            >
              {line.homeStations.map((s) => (
                <option key={s.code} value={s.code} className="bg-go-dark text-white">
                  {s.name}
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
            <div className="text-xs leading-tight">🏠 {homeStation.shortName}</div>
            <div className="text-xs text-white/60">→ Union</div>
          </button>
          <button
            onClick={() => setDirection('officeToHome')}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-semibold transition-all ${
              direction === 'officeToHome' ? 'bg-go-green text-white shadow' : 'text-white/70'
            }`}
          >
            <div className="text-xs leading-tight">🏢 Union</div>
            <div className="text-xs text-white/60">→ {homeStation.shortName}</div>
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
              Tomorrow →
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
              ← Today
            </button>
          )}
        </div>
      </header>

      {/* Route bar */}
      <div className="bg-go-green text-white px-4 py-2 flex items-center gap-2 text-sm">
        <span className="font-semibold">
          {direction === 'homeToOffice' ? homeStation.name : 'Union Station'}
        </span>
        <ArrowRightIcon className="w-4 h-4 shrink-0" />
        <span className="font-semibold">
          {direction === 'homeToOffice' ? 'Union Station' : homeStation.name}
        </span>
        <span className="ml-auto text-white/70 capitalize text-xs">{serviceType}</span>
      </div>

      {/* Add to Home Screen banner (only in mobile browser, not standalone) */}
      <AddToHomeScreenBanner />

      {/* Slim alert banner (only when active alerts exist) */}
      {!alertsLoading && totalAlerts > 0 && (
        <button
          onClick={() => setShowAlertsSheet(true)}
          className="w-full flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-left"
        >
          <span className="text-sm">⚠️</span>
          <span className="text-amber-800 text-xs font-medium flex-1">
            {totalAlerts} active alert{totalAlerts !== 1 ? 's' : ''} on {line.name} line
          </span>
          <span className="text-amber-600 text-xs font-semibold">View →</span>
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
                    {isRefreshing ? 'Refreshing…' : 'Live data'}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {!isRefreshing && `Next refresh in ${refreshCountdown}s`}
                </span>
              </div>
              {lastRefreshed && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Last updated:{' '}
                  {lastRefreshed.toLocaleTimeString('en-CA', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                  })}
                </p>
              )}
            </div>

            <div className="text-center text-xs text-gray-400 mt-3 mb-2 pb-safe">
              Schedule effective {line.effectiveDate} · {line.name} Line
              <br />
              <a
                href="https://github.com/jasonzzx/go-train-status/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="underline mt-1 inline-block"
              >
                Report issues on GitHub
              </a>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-8 pb-safe">
              <img
                src="/personal-icons/JASON_LOGO_512.png"
                alt="Jason Zhong logo"
                className="w-5 h-5 rounded-full"
              />
              <span>Author: Jason Zhong</span>
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
    </div>
  );
}
