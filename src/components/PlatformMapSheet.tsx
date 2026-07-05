'use client';

import { useState, useEffect, useMemo } from 'react';
import { getMappedPlatforms } from '@/lib/union-platform-map';
import {
  computeLeaveByMinutes,
  distanceToUnionMetres,
  estimateWalkMinutes,
} from '@/lib/union-map';
import { buildOfficialGuidance } from '@/lib/union-official-map';
import { torontoNow } from '@/lib/toronto-time';
import { timeToMinutes } from '@/lib/schedule-data';
import { formatMinutesAsHHMM } from '@/lib/countdown';
import { formatPlatformLabel } from '@/lib/tracker-info';
import { useLanguage } from '@/i18n';
import UnionPlatformMap, { MAP_VIEWBOX_WIDTH, MAP_VIEWBOX_HEIGHT } from '@/components/UnionPlatformMap';

// ── Platform map sheet ───────────────────────────────────────────────────────
// Union concourse map with the assigned platform highlighted, plus live
// walk-time / leave-by guidance from the user's location.

const PLATFORM_MAP_ASPECT = MAP_VIEWBOX_WIDTH / MAP_VIEWBOX_HEIGHT;

export interface PlatformSheetInfo {
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

export default function PlatformMapSheet({
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
    const leaveBy = computeLeaveByMinutes(timeToMinutes(departure) + delayMin, walkMin);
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
