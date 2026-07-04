// Matching between GO's tracker platform strings (e.g. "9", "12 & 13") and
// the platforms drawn on the Union Station map. The map geometry itself
// comes from OpenStreetMap (see src/lib/union-map.ts and
// scripts/generate-union-map.mjs); a platform is "mapped" when its number
// appears among the surveyed platform refs.

import { NUMERIC_PLATFORMS } from '@/lib/union-map';

export const MAPPED_PLATFORMS: readonly number[] = NUMERIC_PLATFORMS;

export function parsePlatformNumbers(platform: string): number[] {
  return platform
    .split(/[,/&;]/)
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

/** Returns the subset of a (possibly multi-platform) tracker string, e.g. "12, 13", that's on the map. */
export function getMappedPlatforms(platform: string): number[] {
  const numbers = parsePlatformNumbers(platform);
  return numbers.filter((n) => MAPPED_PLATFORMS.includes(n));
}

/** Whether at least one platform number is drawn on the Union map. */
export function isPlatformMapped(platform: string): boolean {
  return getMappedPlatforms(platform).length > 0;
}
