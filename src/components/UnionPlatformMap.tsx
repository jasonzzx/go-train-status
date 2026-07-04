'use client';

import { useMemo } from 'react';
import {
  UNION_MAP,
  type Guidance,
  type MapPoint,
  type PlatformFeature,
} from '@/lib/union-map';

// Union Station schematic drawn from real OpenStreetMap geometry (see
// scripts/generate-union-map.mjs). Platform strips, concourse access stairs,
// teamways and entrances all sit at their surveyed positions, so the user's
// projected geolocation and the platform highlight share one coordinate
// frame.

const VB = UNION_MAP.viewBox;

// Default view: the central station zone (headhouse + concourses). The full
// frame is ~4:1 because the platforms run ~900 m — the tails carry no
// wayfinding information, so they're only shown in the zoomed-out toggle.
const STATION_VIEW = { x: 250, y: 0, w: 500, h: VB.height };

export const MAP_VIEWBOX_WIDTH = STATION_VIEW.w;
export const MAP_VIEWBOX_HEIGHT = STATION_VIEW.h;

// ~9 m wide platforms, in viewBox units.
const PLATFORM_STROKE = 9 / UNION_MAP.metresPerUnit;

const toPath = (pts: number[][]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');

function platformLabelAnchors(p: PlatformFeature): MapPoint[] {
  // Label at fixed fractions along the strip so at least one anchor is
  // visible in any zoom window.
  const pts = p.points;
  const anchors: MapPoint[] = [];
  for (const f of [0.3, 0.5, 0.7]) {
    let remaining = f * pts.reduce((s, _, i) => (i > 0 ? s + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) : 0), 0);
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (remaining <= seg) {
        const t = seg === 0 ? 0 : remaining / seg;
        anchors.push({
          x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
          y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
        });
        break;
      }
      remaining -= seg;
    }
  }
  return anchors;
}

/** Entrances worth labelling on the map (the rest still render as dots). */
const LABELLED_ENTRANCES = /Great Hall (West|East)|Teamway South End|York St north|Bay St north/;

function shortEntranceName(e: { name: string; description: string }): string {
  if (/Great Hall West/.test(e.description)) return 'Great Hall W';
  if (/Great Hall East/.test(e.description)) return 'Great Hall E';
  if (/York East Teamway South/.test(e.description)) return 'York Teamway';
  if (/Bay West Teamway South/.test(e.description)) return 'Bay Teamway';
  if (/York St north/.test(e.description)) return 'York St';
  if (/Bay St north/.test(e.description)) return 'Bay St';
  return e.name;
}

function fitViewBox(points: MapPoint[], pad: number): { x: number; y: number; w: number; h: number } {
  const aspect = STATION_VIEW.w / STATION_VIEW.h;
  let minX = Math.min(...points.map((p) => p.x)) - pad;
  let maxX = Math.max(...points.map((p) => p.x)) + pad;
  let minY = Math.min(...points.map((p) => p.y)) - pad;
  let maxY = Math.max(...points.map((p) => p.y)) + pad;
  let w = maxX - minX;
  let h = maxY - minY;
  if (w / h > aspect) {
    const grow = w / aspect - h;
    minY -= grow / 2;
    h = w / aspect;
  } else {
    const grow = h * aspect - w;
    minX -= grow / 2;
    w = h * aspect;
  }
  // Keep the window on the drawing.
  minX = Math.max(-20, Math.min(minX, VB.width + 20 - w));
  minY = Math.max(-20, Math.min(minY, VB.height + 20 - h));
  return { x: minX, y: minY, w, h };
}

export default function UnionPlatformMap({
  highlightPlatforms,
  zoomedIn,
  guidance,
  className,
}: {
  highlightPlatforms: number[];
  zoomedIn: boolean;
  guidance: Guidance | null;
  className?: string;
}) {
  const highlighted = (p: PlatformFeature) =>
    p.refs.some((r) => highlightPlatforms.includes(parseInt(r, 10)));

  const viewBox = useMemo(() => {
    if (zoomedIn && highlightPlatforms.length > 0) {
      const focus: MapPoint[] = [];
      if (guidance) {
        focus.push(...guidance.path, { x: guidance.access.x, y: guidance.access.y });
      } else {
        const strip = UNION_MAP.platforms.find((p) =>
          p.refs.some((r) => highlightPlatforms.includes(parseInt(r, 10)))
        );
        if (strip) {
          focus.push(...platformLabelAnchors(strip));
        }
      }
      if (focus.length > 0) {
        const { x, y, w, h } = fitViewBox(focus, 55);
        return `${x} ${y} ${w} ${h}`;
      }
    }
    return `${STATION_VIEW.x} ${STATION_VIEW.y} ${STATION_VIEW.w} ${STATION_VIEW.h}`;
  }, [zoomedIn, highlightPlatforms, guidance]);

  const band = UNION_MAP.concourseBand;

  return (
    <svg viewBox={viewBox} className={className} style={{ transition: 'all 300ms ease-out' }}>
      <rect x={-500} y={-200} width={VB.width + 1000} height={VB.height + 400} fill="#eef1f5" />

      {/* Headhouse (Great Hall block along Front St.) */}
      <path d={toPath(UNION_MAP.headhouse) + ' Z'} fill="#e2e6ec" stroke="#b6bec9" strokeWidth={1} />

      {/* Concourse band — the under-track hall the stairs rise from */}
      <rect
        x={band.x0}
        y={band.y0}
        width={band.x1 - band.x0}
        height={band.y1 - band.y0}
        rx={6}
        fill="#f8fafc"
        stroke="#c3ccd6"
        strokeWidth={1}
        strokeDasharray="4 3"
      />

      {/* Teamway tunnels */}
      {UNION_MAP.teamways.map((tw) => (
        <g key={tw.name}>
          <line x1={tw.x} y1={Math.max(0, tw.y0)} x2={tw.x} y2={tw.y1} stroke="#c3ccd6" strokeWidth={7} strokeLinecap="round" />
          <line x1={tw.x} y1={Math.max(0, tw.y0)} x2={tw.x} y2={tw.y1} stroke="#f8fafc" strokeWidth={4.5} strokeLinecap="round" />
        </g>
      ))}

      {/* Platform strips */}
      {UNION_MAP.platforms.map((p) => {
        const active = highlighted(p);
        const label = p.refs.join(' · ');
        return (
          <g key={p.refs.join(',')} opacity={p.construction && !active ? 0.35 : 1}>
            <path
              d={toPath(p.points)}
              fill="none"
              stroke={active ? '#f59e0b' : p.construction ? '#9aa4b1' : '#c8d0da'}
              strokeWidth={PLATFORM_STROKE}
              strokeLinecap="butt"
              strokeDasharray={p.construction ? '10 6' : undefined}
            >
              {active && <animate attributeName="opacity" values="1;0.6;1" dur="1.4s" repeatCount="indefinite" />}
            </path>
            {platformLabelAnchors(p).map((a, i) => (
              <text
                key={i}
                x={a.x}
                y={a.y + 3}
                textAnchor="middle"
                fontSize={active ? 10 : 8}
                fontWeight={active ? 800 : 600}
                fill={active ? '#7c2d12' : '#5b6674'}
              >
                {label}
              </text>
            ))}
          </g>
        );
      })}

      {/* Guidance path: entrance → concourse → platform stairs */}
      {guidance && (
        <g>
          <path
            d={toPath(guidance.path.map((p) => [p.x, p.y]))}
            fill="none"
            stroke="#2563eb"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="7 5"
          >
            <animate attributeName="stroke-dashoffset" values="24;0" dur="1.6s" repeatCount="indefinite" />
          </path>
          {/* Target stairs marker */}
          <g>
            <circle cx={guidance.access.x} cy={guidance.access.y} r={9} fill="#2563eb" stroke="#ffffff" strokeWidth={2} />
            <text x={guidance.access.x} y={guidance.access.y + 3.5} textAnchor="middle" fontSize={10} fill="#ffffff" fontWeight={800}>
              {guidance.access.escalator ? '≣' : '≡'}
            </text>
          </g>
          {/* Chosen entrance */}
          <circle cx={guidance.entrance.x} cy={guidance.entrance.y} r={5} fill="#2563eb" stroke="#ffffff" strokeWidth={1.5} />
        </g>
      )}

      {/* Station entrances (dots; a few labelled) */}
      {UNION_MAP.entrances.map((e) => {
        const text = `${e.name} ${e.description}`;
        const labelled = LABELLED_ENTRANCES.test(text);
        const isChosen = guidance?.entrance === e;
        if (isChosen) return null;
        return (
          <g key={`${e.x},${e.y}`} opacity={0.85}>
            <circle cx={e.x} cy={e.y} r={3} fill="#64748b" stroke="#ffffff" strokeWidth={1} />
            {labelled && (
              <text x={e.x} y={e.y - 6} textAnchor="middle" fontSize={7.5} fontWeight={600} fill="#475569">
                {shortEntranceName(e)}
              </text>
            )}
          </g>
        );
      })}
      {guidance && (
        <text x={guidance.entrance.x} y={guidance.entrance.y - 8} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#1d4ed8">
          {shortEntranceName(guidance.entrance)}
        </text>
      )}

      {/* User location */}
      {guidance?.userOnMap && (
        <g>
          <circle cx={guidance.userOnMap.x} cy={guidance.userOnMap.y} r={12} fill="#3b82f6" opacity={0.25}>
            <animate attributeName="r" values="8;16;8" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={guidance.userOnMap.x} cy={guidance.userOnMap.y} r={5.5} fill="#3b82f6" stroke="#ffffff" strokeWidth={2} />
        </g>
      )}

      {/* Street labels for orientation */}
      <text x={505} y={-6} textAnchor="middle" fontSize={10} fontWeight={700} fill="#8a94a1" letterSpacing={2}>
        FRONT ST W
      </text>
      <text x={505} y={VB.height + 14} textAnchor="middle" fontSize={9} fontWeight={600} fill="#a5aeba" letterSpacing={2}>
        TRACK LEVEL — SOUTH
      </text>
    </svg>
  );
}
