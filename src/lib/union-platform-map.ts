// Union Station platform location lookup, derived from the City of Toronto
// Union Station Map PDF (Lower Level / Concourses). The source map only
// labels platform *ranges* via concourse/walkway zones, not individual
// platform pins:
//   - "Covered Walkway — Platforms 4-7, 10-11" (York St. side, west)
//   - "YORK Concourse Hall — Platforms 3-13" (also repeated at the VIA
//     Concourse Hall and the Bay St. covered walkway, east)
// Platforms 3-13 run west (York St., lower numbers) to east (Bay St.,
// higher numbers), so each platform's pin position is interpolated along
// that west→east span rather than collapsed onto one of two fixed dots.
// This is still an approximation — the map itself has no finer resolution.

export interface PlatformPin {
  platform: number;
  labelKey: string; // i18n key for the zone's display name
  x: number; // pin position, % of image width
  y: number; // pin position, % of image height
}

export const PLATFORM_MAP_IMAGE = '/union-platform-map.png';

/** Platforms shown on the map, in west→east physical order. */
const MAPPED_PLATFORMS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/** West (York St. walkway) and east (Bay St. walkway) edges of the platform corridor, % of image width. */
const X_WEST = 7;
const X_EAST = 95;

/** Vertical position of the platform corridor / walkway path, % of image height. */
const PIN_Y = 58;

/** Platforms with a dedicated west covered walkway (in addition to the central concourse halls). */
const WEST_WALKWAY_PLATFORMS = new Set([4, 5, 6, 7, 10, 11]);

function parsePlatformNumbers(platform: string): number[] {
  return platform
    .split(/[,/]/)
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

function pinForPlatform(num: number): PlatformPin | null {
  const index = MAPPED_PLATFORMS.indexOf(num);
  if (index === -1) return null;
  const t = index / (MAPPED_PLATFORMS.length - 1);
  return {
    platform: num,
    labelKey: WEST_WALKWAY_PLATFORMS.has(num) ? 'platformZoneWestWalkway' : 'platformZoneYorkConcourse',
    x: X_WEST + t * (X_EAST - X_WEST),
    y: PIN_Y,
  };
}

/** Returns one pin per platform number in a (possibly multi-platform) tracker string, e.g. "12, 13". */
export function getPlatformPins(platform: string): PlatformPin[] {
  return parsePlatformNumbers(platform)
    .map(pinForPlatform)
    .filter((p): p is PlatformPin => p !== null);
}

/** Whether at least one platform number is within the map's covered range (3-13). */
export function isPlatformMapped(platform: string): boolean {
  return getPlatformPins(platform).length > 0;
}
