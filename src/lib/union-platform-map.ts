// Union Station platform location lookup, derived from the City of Toronto
// Union Station Map PDF (Lower Level / Concourses), which labels platform
// *ranges* via concourse/walkway zones rather than individual platforms:
//   - "Covered Walkway — Platforms 4-7, 10-11" (York St. side)
//   - "YORK Concourse Hall — Platforms 3-13" (also repeated at the VIA
//     Concourse Hall and the Bay St. covered walkway)
// The map has no finer resolution than that, so each zone below is the most
// precise location the source supports for the platforms it lists.

export interface PlatformZone {
  id: string;
  platforms: number[];
  labelKey: string; // i18n key for the zone's display name
  x: number; // pin position, % of image width
  y: number; // pin position, % of image height
}

export const PLATFORM_MAP_IMAGE = '/union-platform-map.png';

export const UNION_PLATFORM_ZONES: PlatformZone[] = [
  { id: 'west-walkway', platforms: [4, 5, 6, 7, 10, 11], labelKey: 'platformZoneWestWalkway', x: 6, y: 75 },
  { id: 'york-concourse', platforms: [3, 8, 9, 12, 13], labelKey: 'platformZoneYorkConcourse', x: 21, y: 78 },
];

/** Union platform numbers covered by the source map (3-13). */
const MAPPED_RANGE_MIN = 3;
const MAPPED_RANGE_MAX = 13;

/** Parses a tracker platform string like "12" or "12, 13" into numbers. */
function parsePlatformNumbers(platform: string): number[] {
  return platform
    .split(/[,/]/)
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

/** Returns the distinct zones a (possibly multi-platform) tracker string falls into, or [] if unmapped. */
export function getPlatformZones(platform: string): PlatformZone[] {
  const numbers = parsePlatformNumbers(platform);
  const zones = UNION_PLATFORM_ZONES.filter((z) => numbers.some((n) => z.platforms.includes(n)));
  return zones;
}

/** Whether at least one platform number is within the map's covered range (3-13), even if not in a defined zone. */
export function isPlatformMapped(platform: string): boolean {
  return parsePlatformNumbers(platform).some((n) => n >= MAPPED_RANGE_MIN && n <= MAPPED_RANGE_MAX);
}
