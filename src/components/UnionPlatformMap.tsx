'use client';

import { useMemo } from 'react';
import { MAPPED_PLATFORMS } from '@/lib/union-platform-map';

// Simplified schematic of Union Station's Lower Level / Concourses, redrawn
// from the City of Toronto Union Station Map PDF. It keeps the real
// wayfinding structure (York St. / Bay St. covered walkways, York + VIA
// Concourse Halls, Front St. Promenade) but draws each platform (3-13) as
// its own labelled segment — the source PDF has no such per-platform
// markers, so this is the most precise representation that's still
// faithful to what the map actually shows.

export const MAP_VIEWBOX_WIDTH = 1000;
export const MAP_VIEWBOX_HEIGHT = 360;

const PLATFORM_STRIP_X0 = 15;
const PLATFORM_STRIP_X1 = 935;
const PLATFORM_STRIP_Y0 = 20;
const PLATFORM_STRIP_Y1 = 70;
const HALL_Y0 = 75;
const HALL_Y1 = 340;

const WALKWAY_WIDTH = 40;
const WEST_WALKWAY_X0 = PLATFORM_STRIP_X0;
const WEST_WALKWAY_X1 = WEST_WALKWAY_X0 + WALKWAY_WIDTH;
const EAST_WALKWAY_X1 = PLATFORM_STRIP_X1;
const EAST_WALKWAY_X0 = EAST_WALKWAY_X1 - WALKWAY_WIDTH;

const PROMENADE_X0 = 420;
const PROMENADE_X1 = 500;

function platformSegments() {
  const n = MAPPED_PLATFORMS.length;
  const segWidth = (PLATFORM_STRIP_X1 - PLATFORM_STRIP_X0) / n;
  return MAPPED_PLATFORMS.map((platform, i) => ({
    platform,
    x: PLATFORM_STRIP_X0 + i * segWidth,
    width: segWidth,
  }));
}

const SEGMENTS = platformSegments();
const ZOOM = 3;

export function getPlatformSegmentCenterX(platform: number): number | null {
  const seg = SEGMENTS.find((s) => s.platform === platform);
  return seg ? seg.x + seg.width / 2 : null;
}

export default function UnionPlatformMap({
  highlightPlatforms,
  zoomedIn,
  className,
}: {
  highlightPlatforms: number[];
  zoomedIn: boolean;
  className?: string;
}) {
  const viewBox = useMemo(() => {
    if (!zoomedIn || highlightPlatforms.length === 0) {
      return `0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`;
    }
    const centers = highlightPlatforms
      .map(getPlatformSegmentCenterX)
      .filter((x): x is number => x !== null);
    const centerX = centers.reduce((s, x) => s + x, 0) / centers.length;
    const centerY = PLATFORM_STRIP_Y1;
    const w = MAP_VIEWBOX_WIDTH / ZOOM;
    const h = MAP_VIEWBOX_HEIGHT / ZOOM;
    const minX = Math.min(Math.max(centerX - w / 2, 0), MAP_VIEWBOX_WIDTH - w);
    const minY = Math.min(Math.max(centerY - h / 2, 0), MAP_VIEWBOX_HEIGHT - h);
    return `${minX} ${minY} ${w} ${h}`;
  }, [zoomedIn, highlightPlatforms]);

  return (
    <svg
      viewBox={viewBox}
      className={className}
      style={{ transition: 'all 300ms ease-out' }}
    >
      {/* Background */}
      <rect x={0} y={0} width={MAP_VIEWBOX_WIDTH} height={MAP_VIEWBOX_HEIGHT} fill="#f3f4f6" />

      {/* Front Street label + arrow, above the platform strip */}
      <text x={(PLATFORM_STRIP_X0 + PLATFORM_STRIP_X1) / 2} y={13} textAnchor="middle" fontSize="11" fontWeight="700" fill="#374151">
        Front Street
      </text>

      {/* Platform strip (tracks) */}
      {SEGMENTS.map((seg) => {
        const active = highlightPlatforms.includes(seg.platform);
        return (
          <g key={seg.platform}>
            <rect
              x={seg.x + 1}
              y={PLATFORM_STRIP_Y0}
              width={seg.width - 2}
              height={PLATFORM_STRIP_Y1 - PLATFORM_STRIP_Y0}
              fill={active ? '#f59e0b' : '#cbd5e1'}
              stroke={active ? '#b45309' : '#94a3b8'}
              strokeWidth={active ? 1.5 : 0.75}
            >
              {active && (
                <animate attributeName="opacity" values="1;0.55;1" dur="1.4s" repeatCount="indefinite" />
              )}
            </rect>
            <text
              x={seg.x + seg.width / 2}
              y={(PLATFORM_STRIP_Y0 + PLATFORM_STRIP_Y1) / 2 + 4}
              textAnchor="middle"
              fontSize={active ? 13 : 10}
              fontWeight={active ? 800 : 600}
              fill={active ? '#ffffff' : '#475569'}
            >
              {seg.platform}
            </text>
          </g>
        );
      })}

      {/* West covered walkway */}
      <rect x={WEST_WALKWAY_X0} y={PLATFORM_STRIP_Y1} width={WALKWAY_WIDTH} height={HALL_Y1 - PLATFORM_STRIP_Y1} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.75} />
      <text x={WEST_WALKWAY_X0 + 14} y={(PLATFORM_STRIP_Y1 + HALL_Y1) / 2} textAnchor="middle" fontSize="9" fontWeight="600" fill="#4b5563" transform={`rotate(-90 ${WEST_WALKWAY_X0 + 14} ${(PLATFORM_STRIP_Y1 + HALL_Y1) / 2})`}>
        Covered Walkway — Platforms 4-7, 10-11
      </text>

      {/* East covered walkway */}
      <rect x={EAST_WALKWAY_X0} y={PLATFORM_STRIP_Y1} width={WALKWAY_WIDTH} height={HALL_Y1 - PLATFORM_STRIP_Y1} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.75} />
      <text x={EAST_WALKWAY_X0 + 26} y={(PLATFORM_STRIP_Y1 + HALL_Y1) / 2} textAnchor="middle" fontSize="9" fontWeight="600" fill="#4b5563" transform={`rotate(-90 ${EAST_WALKWAY_X0 + 26} ${(PLATFORM_STRIP_Y1 + HALL_Y1) / 2})`}>
        Covered Walkway — Platforms 3-13
      </text>

      {/* York Concourse Hall */}
      <rect x={WEST_WALKWAY_X1} y={HALL_Y0} width={PROMENADE_X0 - WEST_WALKWAY_X1} height={HALL_Y1 - HALL_Y0} fill="#ffffff" stroke="#9ca3af" strokeWidth={0.75} />
      <text x={(WEST_WALKWAY_X1 + PROMENADE_X0) / 2} y={(HALL_Y0 + HALL_Y1) / 2 - 6} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1f2937">
        YORK Concourse Hall
      </text>
      <text x={(WEST_WALKWAY_X1 + PROMENADE_X0) / 2} y={(HALL_Y0 + HALL_Y1) / 2 + 12} textAnchor="middle" fontSize="10" fill="#4b5563">
        Platforms 3-13
      </text>

      {/* Front St. Promenade connector */}
      <rect x={PROMENADE_X0} y={HALL_Y0} width={PROMENADE_X1 - PROMENADE_X0} height={HALL_Y1 - HALL_Y0} fill="#f9fafb" stroke="#9ca3af" strokeWidth={0.75} strokeDasharray="3 3" />
      <text x={(PROMENADE_X0 + PROMENADE_X1) / 2} y={(HALL_Y0 + HALL_Y1) / 2} textAnchor="middle" fontSize="8" fill="#6b7280" transform={`rotate(-90 ${(PROMENADE_X0 + PROMENADE_X1) / 2} ${(HALL_Y0 + HALL_Y1) / 2})`}>
        Front St. Promenade
      </text>

      {/* VIA Concourse Hall */}
      <rect x={PROMENADE_X1} y={HALL_Y0} width={EAST_WALKWAY_X0 - PROMENADE_X1} height={HALL_Y1 - HALL_Y0} fill="#ffffff" stroke="#9ca3af" strokeWidth={0.75} />
      <text x={(PROMENADE_X1 + EAST_WALKWAY_X0) / 2} y={(HALL_Y0 + HALL_Y1) / 2 - 6} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1f2937">
        VIA Concourse Hall
      </text>
      <text x={(PROMENADE_X1 + EAST_WALKWAY_X0) / 2} y={(HALL_Y0 + HALL_Y1) / 2 + 12} textAnchor="middle" fontSize="10" fill="#4b5563">
        Platforms 3-13
      </text>

      {/* York Street label */}
      <text x={6} y={(PLATFORM_STRIP_Y1 + HALL_Y1) / 2} textAnchor="middle" fontSize="10" fontWeight="700" fill="#374151" transform={`rotate(-90 6 ${(PLATFORM_STRIP_Y1 + HALL_Y1) / 2})`}>
        York Street
      </text>

      {/* Bay Street label */}
      <text x={MAP_VIEWBOX_WIDTH - 6} y={(PLATFORM_STRIP_Y1 + HALL_Y1) / 2} textAnchor="middle" fontSize="10" fontWeight="700" fill="#374151" transform={`rotate(-90 ${MAP_VIEWBOX_WIDTH - 6} ${(PLATFORM_STRIP_Y1 + HALL_Y1) / 2})`}>
        Bay Street
      </text>
    </svg>
  );
}
