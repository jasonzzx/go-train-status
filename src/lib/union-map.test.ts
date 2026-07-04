import { describe, it, expect } from 'vitest';
import {
  UNION_MAP,
  UNION_STATION_COORDS,
  projectToMap,
  isOnMap,
  haversineMetres,
  distanceToUnionMetres,
  estimateWalkMinutes,
  computeLeaveByMinutes,
  buildGuidance,
  LEAVE_BY_BUFFER_MIN,
} from './union-map';

describe('projectToMap', () => {
  it('reproduces the generator projection for every entrance (round-trip through real data)', () => {
    // Entrances carry both their raw lat/lon and the map x/y the generator
    // computed — projecting the former must land on the latter.
    for (const e of UNION_MAP.entrances) {
      const p = projectToMap(e.lat, e.lon);
      expect(Math.abs(p.x - e.x)).toBeLessThan(0.5);
      expect(Math.abs(p.y - e.y)).toBeLessThan(0.5);
    }
  });

  it('projects the station centre onto the map, and far places off it', () => {
    const centre = projectToMap(UNION_STATION_COORDS.lat, UNION_STATION_COORDS.lon);
    expect(isOnMap(centre)).toBe(true);
    const airport = projectToMap(43.6777, -79.6248); // YYZ
    expect(isOnMap(airport, 100)).toBe(false);
  });
});

describe('distances and walking', () => {
  it('haversine matches a known downtown distance', () => {
    // Union Station ↔ CN Tower is about 500–600 m.
    const d = haversineMetres(43.6453, -79.3806, 43.6426, -79.3871);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(700);
  });

  it('distanceToUnionMetres is ~0 at the station', () => {
    expect(distanceToUnionMetres(UNION_STATION_COORDS.lat, UNION_STATION_COORDS.lon)).toBe(0);
  });

  it('walk estimate applies the route factor and rounds up', () => {
    // 800 m × 1.3 ÷ 80 m/min = 13 min
    expect(estimateWalkMinutes(800)).toBe(13);
    expect(estimateWalkMinutes(0)).toBe(0);
  });
});

describe('computeLeaveByMinutes', () => {
  it('subtracts walk time and the platform buffer', () => {
    // 17:32 departure, 13 min walk → leave by 17:32 − 13 − buffer
    expect(computeLeaveByMinutes(17 * 60 + 32, 13)).toBe(17 * 60 + 32 - 13 - LEAVE_BY_BUFFER_MIN);
  });

  it('never goes negative', () => {
    expect(computeLeaveByMinutes(5, 30)).toBe(0);
  });
});

describe('buildGuidance', () => {
  it('guides to a stairs/escalator on the requested platform', () => {
    const g = buildGuidance(null, [12, 13]);
    expect(g).not.toBeNull();
    expect(g!.access.refs.some((r) => [12, 13].includes(parseInt(r, 10)))).toBe(true);
    // Path ends at the access point.
    const last = g!.path.at(-1)!;
    expect(last.x).toBe(g!.access.x);
    expect(last.y).toBe(g!.access.y);
  });

  it('starts from the Great Hall by default (no location)', () => {
    const g = buildGuidance(null, [8, 9]);
    expect(g!.userOnMap).toBeNull();
    expect(`${g!.entrance.name} ${g!.entrance.description}`).toMatch(/Great Hall/);
  });

  it('picks the nearest entrance and shows the user when close to the station', () => {
    // Standing on Front St, ~20 m in front of the Great Hall.
    const g = buildGuidance({ lat: 43.64545, lon: -79.38106 }, [12, 13]);
    expect(g).not.toBeNull();
    expect(g!.userOnMap).not.toBeNull();
    // Path starts at the user, goes via the entrance.
    expect(g!.path.length).toBeGreaterThanOrEqual(3);
    expect(g!.path[0]).toEqual(g!.userOnMap);
  });

  it('keeps the user off-map when far away but still routes from an entrance', () => {
    // ~2 km north (Queen's Park).
    const g = buildGuidance({ lat: 43.6629, lon: -79.3900 }, [12, 13]);
    expect(g).not.toBeNull();
    expect(g!.userOnMap).toBeNull();
    expect(g!.path[0].x).toBe(g!.entrance.x);
    expect(g!.path[0].y).toBe(g!.entrance.y);
  });

  it('returns null for platforms with no mapped access', () => {
    expect(buildGuidance(null, [99])).toBeNull();
  });
});
