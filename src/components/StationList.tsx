'use client';

import { useMemo } from 'react';
import { minutesToTime, type StationStop } from '@/lib/schedule-data';
import { useLanguage, getStationName } from '@/i18n';

// ── Station stop list (expandable inside TrainCard) ─────────────────────────

export default function StationList({
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
  /** Live delay (minutes, positive = late). In On Board mode every stop time
      is re-rendered as scheduled + delay, so the list shows when the train is
      actually expected; the value refreshes with each tracker poll. */
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

  // On Board + a live delay: show each stop's expected time (scheduled +
  // delay) instead of the timetable time, with the scheduled one struck
  // through beside it. Collapsed/off-board lists keep the timetable times.
  const showAdjusted = onBoard && delayMin !== 0;
  const signedDelay = delayMin > 0 ? `+${delayMin}` : `${delayMin}`;
  // "Scheduled:" / "排定时间：" — reused as a tooltip, so drop the trailing colon.
  const scheduledLabel = t('scheduled').replace(/[:：]\s*$/, '');

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
    <div>
      {/* Live-delay notice — makes clear the stop times below are shifted */}
      {showAdjusted && (
        <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-[10px] font-semibold ${
          isNext ? 'bg-white/15 text-amber-100' : 'bg-amber-50 text-amber-700'
        }`}>
          <span className="leading-none">⚠</span>
          <span>{t('onBoardDelayNotice', { min: signedDelay })}</span>
        </div>
      )}

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
          // Expected time at this stop = scheduled + live delay. null when the
          // times are unshifted, or for a stop the live feed gave us no time for
          // (applyLiveStops leaves scheduledTime empty in that case).
          const adjustedTime = showAdjusted && stop.scheduledTime
            ? minutesToTime(stop.scheduledMinutes + delayMin)
            : null;

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
                  <span className="flex items-baseline gap-1.5 ml-2 shrink-0">
                    {/* Scheduled time, kept visible (struck through) whenever the
                        expected time next to it has been shifted by the delay. */}
                    {adjustedTime && (
                      <span
                        title={`${scheduledLabel} ${stop.scheduledTime}`}
                        className={`text-[10px] font-mono line-through ${
                          isPassed ? (isNext ? 'text-white/25' : 'text-gray-300') : isNext ? 'text-white/40' : 'text-gray-400'
                        }`}
                      >
                        {stop.scheduledTime}
                      </span>
                    )}
                    <span className={`text-xs font-mono ${
                      isAtFinal ? 'text-go-accent font-bold'
                      : isUpcomingStation ? isNext ? 'text-white font-bold' : 'text-go-dark font-bold'
                      : isPassed ? isNext ? 'text-white/35' : 'text-gray-300'
                      : adjustedTime ? isNext ? 'text-amber-200 font-semibold' : 'text-amber-600 font-semibold'
                      : isNext ? 'text-white/70' : 'text-gray-500'
                    }`}>
                      {adjustedTime ?? stop.scheduledTime}
                    </span>
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
    </div>
  );
}
