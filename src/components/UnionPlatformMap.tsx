'use client';

import { useMemo } from 'react';
import { OFFICIAL_MAP, type OfficialGuidance } from '@/lib/union-official-map';
import type { MapPoint } from '@/lib/union-map';

// The official Metrolinx concourse map (see src/lib/union-official-map.ts for
// provenance) rendered as an <image> base layer inside an SVG, with the live
// guidance overlay — highlighted stair banks, walking path, user dot — drawn
// on top in the same pixel coordinate space.

const IMG = OFFICIAL_MAP;

// Default view: the concourse core (Great Hall down to the 20–21 stairs).
// The moat/teamway stair banks at the far edges come into view via the
// guidance zoom or the full-map toggle.
const STATION_VIEW = { x: 540, y: 170, w: 1520, h: 1030 };

export const MAP_VIEWBOX_WIDTH = STATION_VIEW.w;
export const MAP_VIEWBOX_HEIGHT = STATION_VIEW.h;

function fitViewBox(points: MapPoint[], pad: number): { x: number; y: number; w: number; h: number } {
  const aspect = STATION_VIEW.w / STATION_VIEW.h;
  let minX = Math.min(...points.map((p) => p.x)) - pad;
  let maxX = Math.max(...points.map((p) => p.x)) + pad;
  let minY = Math.min(...points.map((p) => p.y)) - pad;
  let maxY = Math.max(...points.map((p) => p.y)) + pad;
  let w = maxX - minX;
  let h = maxY - minY;
  if (w / h > aspect) {
    minY -= (w / aspect - h) / 2;
    h = w / aspect;
  } else {
    minX -= (h * aspect - w) / 2;
    w = h * aspect;
  }
  // Keep the window on the drawing.
  minX = Math.max(0, Math.min(minX, IMG.width - w));
  minY = Math.max(0, Math.min(minY, IMG.height - h));
  return { x: minX, y: minY, w: Math.min(w, IMG.width), h: Math.min(h, IMG.height) };
}

const toPath = (pts: MapPoint[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

export default function UnionPlatformMap({
  highlightPlatforms,
  zoomedIn,
  guidance,
  className,
}: {
  highlightPlatforms: number[];
  zoomedIn: boolean;
  guidance: OfficialGuidance | null;
  className?: string;
}) {
  const viewBox = useMemo(() => {
    if (zoomedIn && guidance) {
      const focus = [...guidance.path, { x: guidance.access.x, y: guidance.access.y }];
      const { x, y, w, h } = fitViewBox(focus, 170);
      return `${x} ${y} ${w} ${h}`;
    }
    return `${STATION_VIEW.x} ${STATION_VIEW.y} ${STATION_VIEW.w} ${STATION_VIEW.h}`;
  }, [zoomedIn, guidance]);

  const label = highlightPlatforms.join(' · ');

  return (
    <svg viewBox={viewBox} className={className} style={{ transition: 'all 300ms ease-out' }}>
      <rect x={-200} y={-200} width={IMG.width + 400} height={IMG.height + 400} fill="#f4f2ee" />
      <image href={IMG.href} x={0} y={0} width={IMG.width} height={IMG.height} />

      {guidance && (
        <g>
          {/* Other stair banks signed for the same platform: soft rings */}
          {guidance.alternates.map((a) => (
            <circle
              key={a.id}
              cx={a.x}
              cy={a.y}
              r={40}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={6}
              opacity={0.4}
            />
          ))}

          {/* Walking path: user → door → stairs */}
          <path
            d={toPath(guidance.path)}
            fill="none"
            stroke="#2563eb"
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="22 16"
          >
            <animate attributeName="stroke-dashoffset" values="76;0" dur="1.6s" repeatCount="indefinite" />
          </path>

          {/* Chosen door */}
          <circle cx={guidance.entrancePx.x} cy={guidance.entrancePx.y} r={16} fill="#2563eb" stroke="#ffffff" strokeWidth={5} />

          {/* Target stair bank: pulsing amber ring + platform chip */}
          <circle cx={guidance.access.x} cy={guidance.access.y} r={46} fill="#f59e0b" opacity={0.18}>
            <animate attributeName="r" values="38;58;38" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <circle cx={guidance.access.x} cy={guidance.access.y} r={40} fill="none" stroke="#f59e0b" strokeWidth={9}>
            <animate attributeName="opacity" values="1;0.55;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
          {label && (
            <g>
              <rect
                x={guidance.access.x - 24 - label.length * 10}
                y={guidance.access.y - 106}
                width={48 + label.length * 20}
                height={52}
                rx={26}
                fill="#b45309"
              />
              <text
                x={guidance.access.x}
                y={guidance.access.y - 70}
                textAnchor="middle"
                fontSize={34}
                fontWeight={800}
                fill="#ffffff"
              >
                {label}
              </text>
            </g>
          )}

          {/* User location */}
          {guidance.userPx && (
            <g>
              <circle cx={guidance.userPx.x} cy={guidance.userPx.y} r={36} fill="#3b82f6" opacity={0.25}>
                <animate attributeName="r" values="26;48;26" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={guidance.userPx.x} cy={guidance.userPx.y} r={17} fill="#3b82f6" stroke="#ffffff" strokeWidth={6} />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}
