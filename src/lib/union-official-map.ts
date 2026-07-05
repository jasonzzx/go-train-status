// Guidance overlay data for the official Metrolinx Union Station concourse
// map (UNI-MA3.4, "Concourse and street level map"). The base image is a
// rasterized crop of the official PDF, committed at
// public/union-official-map.webp; all coordinates below are pixels in that
// image.
//
// The official map is concourse-level: platforms aren't drawn to scale, they
// are reached through labelled stair banks ("Platforms 3–13", "20–21",
// "4–13"). Those stair banks and the station doors are hand-annotated pixel
// anchors. The user's live position is projected with an affine transform
// fitted by least squares from six building-envelope control points shared
// with the OpenStreetMap frame (Great Hall doors, teamway ends); residuals
// are under 27 px (~4 m at this drawing scale).

import {
  UNION_MAP,
  projectToMap,
  haversineMetres,
  type EntranceFeature,
  type MapPoint,
} from '@/lib/union-map';

export const OFFICIAL_MAP = {
  href: '/union-official-map.webp',
  width: 2400,
  height: 1612,
} as const;

// OSM frame (viewBox units) -> official image pixels.
const F2I = {
  a: 4.54564433665598,
  b: -0.1749674841850245,
  c: -1006.566087139058,
  d: -0.019547066854871398,
  e: 4.089716745909527,
  f: 270.18269987451333,
} as const;

export function frameToImage(p: MapPoint): MapPoint {
  return {
    x: F2I.a * p.x + F2I.b * p.y + F2I.c,
    y: F2I.d * p.x + F2I.e * p.y + F2I.f,
  };
}

export function latLonToImage(lat: number, lon: number): MapPoint {
  return frameToImage(projectToMap(lat, lon));
}

export function isOnImage(p: MapPoint, marginPx = 0): boolean {
  return (
    p.x >= -marginPx && p.x <= OFFICIAL_MAP.width + marginPx &&
    p.y >= -marginPx && p.y <= OFFICIAL_MAP.height + marginPx
  );
}

export interface OfficialAccess {
  id: string;
  /** Inclusive platform range this stair bank is signed for. */
  from: number;
  to: number;
  concourse: string;
  x: number;
  y: number;
}

// Hand-annotated "Platforms X–Y" stair banks on the official map.
export const OFFICIAL_ACCESS: readonly OfficialAccess[] = [
  { id: 'york-3-13', from: 3, to: 13, concourse: 'York Concourse', x: 853, y: 835 },
  { id: 'bay-3-13', from: 3, to: 13, concourse: 'Bay Concourse', x: 1749, y: 831 },
  { id: 'west-4-13', from: 4, to: 13, concourse: 'York West Teamway', x: 335, y: 700 },
  { id: 'east-4-13', from: 4, to: 13, concourse: 'Bay East Teamway', x: 2242, y: 700 },
  { id: 'via-20-21', from: 20, to: 21, concourse: 'VIA Concourse', x: 1319, y: 1018 },
  { id: 'york-20-21', from: 20, to: 21, concourse: 'York Concourse', x: 802, y: 1070 },
  { id: 'west-20-21', from: 20, to: 21, concourse: 'York West Teamway', x: 328, y: 1053 },
  { id: 'east-20-21', from: 20, to: 21, concourse: 'Bay East Teamway', x: 2241, y: 1051 },
];

/** Platforms the official map gives stair guidance for (3–13 and 20–21). */
export const OFFICIAL_PLATFORMS: readonly number[] = [
  ...OFFICIAL_ACCESS.flatMap((a) =>
    Array.from({ length: a.to - a.from + 1 }, (_, i) => a.from + i)
  ),
]
  .filter((n, i, arr) => arr.indexOf(n) === i)
  .sort((a, b) => a - b);

// Door positions on the official drawing, matched to the OSM entrance list by
// name/description. Anything not listed falls back to the affine transform.
const ENTRANCE_PX: [RegExp, MapPoint][] = [
  [/Great Hall West/, { x: 1120, y: 283 }],
  [/Great Hall East/, { x: 1518, y: 283 }],
  [/Front St West Wing/, { x: 811, y: 289 }],
  [/Front St East Wing/, { x: 1780, y: 289 }],
  [/York East Teamway South/, { x: 596, y: 1092 }],
  [/York East Teamway North/, { x: 596, y: 549 }],
  [/Bay West Teamway South/, { x: 2024, y: 1095 }],
  [/Bay West Teamway North/, { x: 2024, y: 549 }],
  [/York West Teamway/, { x: 318, y: 568 }],
];

export function entranceImagePoint(e: EntranceFeature): MapPoint {
  const text = `${e.name} ${e.description}`;
  const hit = ENTRANCE_PX.find(([re]) => re.test(text));
  return hit ? hit[1] : frameToImage({ x: e.x, y: e.y });
}

export interface OfficialGuidance {
  /** Which door to enter (nearest to the user, or Great Hall West by default). */
  entrance: EntranceFeature;
  entrancePx: MapPoint;
  /** The stair bank to walk to. */
  access: OfficialAccess;
  /** Other stair banks signed for the same platform (shown as soft rings). */
  alternates: OfficialAccess[];
  /** Dashed polyline in image pixels: user (if on map) → door → stairs. */
  path: MapPoint[];
  /** The user's projected position when it falls on the drawing. */
  userPx: MapPoint | null;
}

const DEFAULT_ENTRANCE = 'Great Hall West';

export function buildOfficialGuidance(
  user: { lat: number; lon: number } | null,
  platformNums: number[]
): OfficialGuidance | null {
  const serving = OFFICIAL_ACCESS.filter((a) =>
    platformNums.some((n) => n >= a.from && n <= a.to)
  );
  if (serving.length === 0 || UNION_MAP.entrances.length === 0) return null;

  let entrance: EntranceFeature;
  let userPx: MapPoint | null = null;

  if (user) {
    entrance = UNION_MAP.entrances.reduce((best, e) =>
      haversineMetres(user.lat, user.lon, e.lat, e.lon) <
      haversineMetres(user.lat, user.lon, best.lat, best.lon)
        ? e
        : best
    );
    const projected = latLonToImage(user.lat, user.lon);
    if (isOnImage(projected, 120)) userPx = projected;
  } else {
    entrance =
      UNION_MAP.entrances.find((e) => e.description.includes(DEFAULT_ENTRANCE)) ??
      UNION_MAP.entrances[0];
  }

  const entrancePx = entranceImagePoint(entrance);
  const access = serving.reduce((best, a) =>
    Math.hypot(a.x - entrancePx.x, a.y - entrancePx.y) <
    Math.hypot(best.x - entrancePx.x, best.y - entrancePx.y)
      ? a
      : best
  );

  const path: MapPoint[] = [];
  if (userPx) path.push(userPx);
  path.push(entrancePx);
  // One right-angle elbow keeps the guide line running along the concourse
  // instead of cutting diagonally across the drawing.
  if (Math.abs(entrancePx.x - access.x) > 60) {
    path.push({ x: entrancePx.x, y: access.y });
  }
  path.push({ x: access.x, y: access.y });

  return {
    entrance,
    entrancePx,
    access,
    alternates: serving.filter((a) => a !== access),
    path,
    userPx,
  };
}
