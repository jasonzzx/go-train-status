'use client';

import { useMemo } from 'react';
import { getStops, timeToMinutes, type Direction, type Trip } from '@/lib/schedule-data';
import type { ParsedAlert } from '@/app/api/alerts/route';
import { formatPlatformLabel, type TrackerInfo } from '@/lib/tracker-info';
import { isPlatformMapped } from '@/lib/union-platform-map';
import { useLanguage } from '@/i18n';
import { TrainIcon, BusIcon, ArrowRightIcon } from '@/components/icons';
import StationList from '@/components/StationList';
import CountdownChip from '@/components/CountdownChip';

// The map is drawn from real OpenStreetMap survey geometry
// (src/data/union-station-map.json, regenerate with npm run generate-union-map).
const PLATFORM_MAP_ENABLED = true;

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

export default function TrainCard({
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
