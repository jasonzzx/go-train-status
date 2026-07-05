import { describe, it, expect } from 'vitest';
import {
  OFFICIAL_MAP,
  OFFICIAL_ACCESS,
  OFFICIAL_PLATFORMS,
  frameToImage,
  latLonToImage,
  isOnImage,
  entranceImagePoint,
  buildOfficialGuidance,
} from './union-official-map';
import { UNION_MAP } from './union-map';

describe('OFFICIAL_PLATFORMS', () => {
  it('covers the signed ranges 3–13 and 20–21', () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 20, 21]) {
      expect(OFFICIAL_PLATFORMS).toContain(n);
    }
  });

  it('excludes UP Express, VIA-only and under-construction platforms', () => {
    for (const n of [1, 2, 14, 19, 24, 27]) {
      expect(OFFICIAL_PLATFORMS).not.toContain(n);
    }
  });
});

describe('frameToImage', () => {
  it('lands the Great Hall doors near their hand-annotated pixels', () => {
    // The affine was fitted on envelope anchors; the doors must round-trip
    // through the OSM entrance coordinates to within the fit residuals.
    const ghw = UNION_MAP.entrances.find((e) => e.description.includes('Great Hall West'))!;
    const p = frameToImage({ x: ghw.x, y: ghw.y });
    const anchor = entranceImagePoint(ghw);
    expect(Math.hypot(p.x - anchor.x, p.y - anchor.y)).toBeLessThan(60);
  });

  it('projects live coordinates onto the drawing', () => {
    // Front St in front of the Great Hall.
    const p = latLonToImage(43.64545, -79.38106);
    expect(isOnImage(p, 120)).toBe(true);
    // Pearson airport is nowhere near the drawing.
    expect(isOnImage(latLonToImage(43.6777, -79.6248), 120)).toBe(false);
  });
});

describe('buildOfficialGuidance', () => {
  it('routes to a stair bank signed for the platform', () => {
    const g = buildOfficialGuidance(null, [12, 13]);
    expect(g).not.toBeNull();
    expect(g!.access.from).toBeLessThanOrEqual(12);
    expect(g!.access.to).toBeGreaterThanOrEqual(12);
    const last = g!.path.at(-1)!;
    expect(last).toEqual({ x: g!.access.x, y: g!.access.y });
  });

  it('defaults to Great Hall West and the York Concourse stairs', () => {
    const g = buildOfficialGuidance(null, [12, 13]);
    expect(g!.entrance.description).toMatch(/Great Hall West/);
    expect(g!.access.id).toBe('york-3-13');
    expect(g!.userPx).toBeNull();
  });

  it('lists the other signed stair banks as alternates', () => {
    const g = buildOfficialGuidance(null, [12, 13]);
    const ids = g!.alternates.map((a) => a.id);
    expect(ids).toContain('bay-3-13');
    expect(ids).not.toContain('york-3-13');
    expect(ids).not.toContain('via-20-21');
  });

  it('serves 20–21 from the VIA/York stair banks', () => {
    const g = buildOfficialGuidance(null, [20, 21]);
    expect(g!.access.from).toBe(20);
    expect(OFFICIAL_ACCESS.map((a) => a.id)).toContain(g!.access.id);
  });

  it('shows the user and starts the path at their position when nearby', () => {
    const g = buildOfficialGuidance({ lat: 43.64545, lon: -79.38106 }, [12, 13]);
    expect(g!.userPx).not.toBeNull();
    expect(g!.path[0]).toEqual(g!.userPx);
    expect(g!.path.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps a far-away user off the drawing but still routes from a door', () => {
    const g = buildOfficialGuidance({ lat: 43.6629, lon: -79.39 }, [12, 13]);
    expect(g!.userPx).toBeNull();
    expect(g!.path[0]).toEqual(g!.entrancePx);
  });

  it('returns null for platforms with no signed access', () => {
    expect(buildOfficialGuidance(null, [24])).toBeNull();
    expect(buildOfficialGuidance(null, [15])).toBeNull();
  });

  it('anchors sit inside the image', () => {
    for (const a of OFFICIAL_ACCESS) {
      expect(a.x).toBeGreaterThan(0);
      expect(a.x).toBeLessThan(OFFICIAL_MAP.width);
      expect(a.y).toBeGreaterThan(0);
      expect(a.y).toBeLessThan(OFFICIAL_MAP.height);
    }
  });
});
