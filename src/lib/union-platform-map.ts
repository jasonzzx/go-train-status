// Union Station platform layout, derived from the City of Toronto Union
// Station Map PDF (Lower Level / Concourses). That PDF has no per-platform
// markers — every coloured/numbered box on it is a "Union Retail" food/shop
// directory entry (confirmed against its own legend), not a platform. The
// only platform information it actually contains is two plain-text range
// captions:
//   - "Covered Walkway — Platforms 4-7, 10-11" (York St. side, west)
//   - "YORK/VIA Concourse Hall — Platforms 3-13" (centre, repeated at the
//     Bay St. covered walkway, east)
// Platforms 3-13 run west (York St., lower numbers) → east (Bay St., higher
// numbers). UnionPlatformMap (src/components/UnionPlatformMap.tsx) draws an
// explicit, individually-labelled segment for each platform in that span so
// highlighting a platform highlights a real, distinct shape — not a guessed
// point on a photo. This is still a simplified schematic, not a literal
// trace of the source PDF.

export const MAPPED_PLATFORMS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

/** Platforms with a dedicated west covered walkway (in addition to the central concourse halls). */
const WEST_WALKWAY_PLATFORMS = new Set([4, 5, 6, 7, 10, 11]);

export function parsePlatformNumbers(platform: string): number[] {
  return platform
    .split(/[,/]/)
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

/** i18n key describing which part of the concourse serves this platform. */
export function getPlatformLabelKey(num: number): string {
  return WEST_WALKWAY_PLATFORMS.has(num) ? 'platformZoneWestWalkway' : 'platformZoneYorkConcourse';
}

/** Returns the subset of a (possibly multi-platform) tracker string, e.g. "12, 13", that's on the map. */
export function getMappedPlatforms(platform: string): number[] {
  const numbers = parsePlatformNumbers(platform);
  return numbers.filter((n) => (MAPPED_PLATFORMS as readonly number[]).includes(n));
}

/** Whether at least one platform number is within the map's covered range (3-13). */
export function isPlatformMapped(platform: string): boolean {
  return getMappedPlatforms(platform).length > 0;
}
