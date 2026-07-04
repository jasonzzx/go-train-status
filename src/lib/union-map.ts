// Union Station map geometry + wayfinding logic, backed by
// src/data/union-station-map.json (generated from OpenStreetMap by
// scripts/generate-union-map.mjs — real surveyed geometry, ODbL licensed).
//
// Everything here is pure: projection math mirrors the generator's transform
// exactly, so a live geolocation fix lands on the same map frame the
// platform strips were drawn in.

import mapData from '@/data/union-station-map.json';

export interface MapPoint {
  x: number;
  y: number;
}

export interface PlatformFeature {
  refs: string[];
  construction: boolean;
  operator: string;
  points: number[][];
}

export interface AccessFeature {
  refs: string[];
  x: number;
  y: number;
  escalator: boolean;
  flights: number;
}

export interface EntranceFeature {
  name: string;
  description: string;
  level: string;
  x: number;
  y: number;
  lat: number;
  lon: number;
}

export interface UnionMapData {
  attribution: string;
  source: string;
  generatedAt: string;
  viewBox: { width: number; height: number };
  transform: {
    lat0: number;
    lon0: number;
    mPerDegLat: number;
    mPerDegLon: number;
    rotRad: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  metresPerUnit: number;
  platforms: PlatformFeature[];
  concourseBand: { x0: number; x1: number; y0: number; y1: number };
  teamways: { name: string; x: number; y0: number; y1: number }[];
  headhouse: number[][];
  platformAccess: AccessFeature[];
  entrances: EntranceFeature[];
}

export const UNION_MAP = mapData as UnionMapData;

/** Centre of the platform group — "Union Station" for distance purposes. */
export const UNION_STATION_COORDS = {
  lat: UNION_MAP.transform.lat0,
  lon: UNION_MAP.transform.lon0,
};

/** Numeric platform numbers present on the map. Strictly numeric refs only —
 * parseInt would turn UP Express's "1A" into platform 1, which doesn't exist. */
export const NUMERIC_PLATFORMS = [
  ...new Set(
    UNION_MAP.platforms
      .flatMap((p) => p.refs)
      .filter((r) => /^\d+$/.test(r))
      .map(Number)
  ),
].sort((a, b) => a - b);

/** Project a lat/lon into map viewBox coordinates (same math as the generator). */
export function projectToMap(lat: number, lon: number): MapPoint {
  const t = UNION_MAP.transform;
  const mx = (lon - t.lon0) * t.mPerDegLon;
  const my = (lat - t.lat0) * t.mPerDegLat;
  const cos = Math.cos(t.rotRad);
  const sin = Math.sin(t.rotRad);
  const fx = mx * cos - my * sin;
  const fy = -(mx * sin + my * cos);
  return {
    x: (fx + t.offsetX) * t.scale,
    y: (fy + t.offsetY) * t.scale,
  };
}

export function isOnMap(p: MapPoint, marginUnits = 0): boolean {
  const { width, height } = UNION_MAP.viewBox;
  return (
    p.x >= -marginUnits && p.x <= width + marginUnits &&
    p.y >= -marginUnits && p.y <= height + marginUnits
  );
}

export function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function distanceToUnionMetres(lat: number, lon: number): number {
  return haversineMetres(lat, lon, UNION_STATION_COORDS.lat, UNION_STATION_COORDS.lon);
}

// Street walking is never as the crow flies: 1.3× route factor over the
// downtown grid, at a brisk-commuter 80 m/min (~4.8 km/h).
const WALK_ROUTE_FACTOR = 1.3;
const WALK_METRES_PER_MIN = 80;

export function estimateWalkMinutes(distanceMetres: number): number {
  return Math.ceil((distanceMetres * WALK_ROUTE_FACTOR) / WALK_METRES_PER_MIN);
}

/** Minutes to spare at the platform after the walk. */
export const LEAVE_BY_BUFFER_MIN = 3;

/**
 * "Leave by" in minutes-since-midnight (Toronto). Departure must already
 * include any live delay. Clamped into a single day; a same-day departure is
 * assumed (GO's last trains leave before midnight).
 */
export function computeLeaveByMinutes(departureMinutes: number, walkMinutes: number): number {
  return Math.max(0, departureMinutes - walkMinutes - LEAVE_BY_BUFFER_MIN) % 1440;
}

export interface Guidance {
  /** Where to enter the station (nearest door to the user, or Great Hall by default). */
  entrance: EntranceFeature;
  /** The concourse stairs/escalator up to the target platform. */
  access: AccessFeature;
  /** Dashed polyline to draw: user (if on map) → entrance → concourse → stairs. */
  path: MapPoint[];
  /** The user's projected position, when it falls on the map frame. */
  userOnMap: MapPoint | null;
}

function accessesForPlatforms(platformNums: number[]): AccessFeature[] {
  return UNION_MAP.platformAccess.filter((a) =>
    a.refs.some((r) => platformNums.includes(parseInt(r, 10)))
  );
}

const DEFAULT_ENTRANCE_NAME = 'Great Hall West';

/**
 * Build the walking guidance for a platform: which door to use and which
 * concourse stairs lead up to the train. The path is schematic (door →
 * concourse level → stairs), not turn-by-turn routing — the concourses
 * aren't fully mapped indoors, and at this scale a straight guide line is
 * what a hurrying commuter can actually follow.
 */
export function buildGuidance(
  user: { lat: number; lon: number } | null,
  platformNums: number[]
): Guidance | null {
  const accesses = accessesForPlatforms(platformNums);
  if (accesses.length === 0 || UNION_MAP.entrances.length === 0) return null;

  let entrance: EntranceFeature;
  let userOnMap: MapPoint | null = null;

  if (user) {
    entrance = UNION_MAP.entrances.reduce((best, e) =>
      haversineMetres(user.lat, user.lon, e.lat, e.lon) <
      haversineMetres(user.lat, user.lon, best.lat, best.lon)
        ? e
        : best
    );
    const projected = projectToMap(user.lat, user.lon);
    if (isOnMap(projected, 40)) userOnMap = projected;
  } else {
    entrance =
      UNION_MAP.entrances.find((e) => e.description.includes(DEFAULT_ENTRANCE_NAME)) ??
      UNION_MAP.entrances[0];
  }

  const access = accesses.reduce((best, a) =>
    Math.hypot(a.x - entrance.x, a.y - entrance.y) < Math.hypot(best.x - entrance.x, best.y - entrance.y)
      ? a
      : best
  );

  const path: MapPoint[] = [];
  if (userOnMap) path.push(userOnMap);
  path.push({ x: entrance.x, y: entrance.y });
  // Into the station and along the concourse: one right-angle elbow keeps the
  // line inside the building instead of cutting diagonally across tracks.
  if (Math.abs(entrance.x - access.x) > 15) {
    path.push({ x: entrance.x, y: access.y });
  }
  path.push({ x: access.x, y: access.y });

  return { entrance, access, path, userOnMap };
}
