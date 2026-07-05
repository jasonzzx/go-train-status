// Matching between GO's tracker platform strings (e.g. "9", "12 & 13") and
// the platforms the official Metrolinx concourse map gives stair guidance
// for (see src/lib/union-official-map.ts). A platform is "mapped" when a
// signed stair bank covers its number.

import { OFFICIAL_PLATFORMS } from '@/lib/union-official-map';

export const MAPPED_PLATFORMS: readonly number[] = OFFICIAL_PLATFORMS;

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
