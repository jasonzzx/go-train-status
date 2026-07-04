// Generates src/data/union-station-map.json from OpenStreetMap via the
// Overpass API. Run manually with `npm run generate-union-map` when the
// station layout changes (platform rebuilds, new concourse work); the output
// is committed so builds and runtime never hit the network.
//
// Data © OpenStreetMap contributors, ODbL — www.openstreetmap.org/copyright.
// The rendered map must keep the attribution string included in the output.
//
// What it extracts, all within a bounding box around Union Station:
//   - GO/VIA/UP rail platforms (linear centreline ways with official `ref`
//     numbers, e.g. "12;13") — drawn as strips by the client
//   - The Union Station headhouse building outline
//   - Concourse→platform access points: stairs/escalator ways whose midpoint
//     sits on a platform centreline (level tags in this area are too
//     inconsistent to use, so proximity is the signal)
//   - Station entrances (teamways, Great Hall, concourse doors)
//
// The GO concourses are only fragmentarily mapped indoors, so instead of
// rendering broken room outlines the client draws a "concourse band" whose
// extent is derived here from the access-point cloud, plus teamway corridors
// reconstructed from their north/south entrance pairs.
//
// Geometry is projected to metres, rotated so the rail corridor runs
// horizontally, and scaled into an SVG viewBox. The affine transform is
// emitted alongside the geometry so the client can project a live
// geolocation fix into map coordinates with the same math
// (see projectToMap in src/lib/union-map.ts).

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BBOX = '43.6435,-79.3860,43.6472,-79.3740';
const HEADHOUSE_ID = 14744491;
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON_EQ = 111320;
const VIEWBOX_WIDTH = 1000;
const PADDING_M = 25;
const ACCESS_MAX_DIST_M = 8;
const ACCESS_CLUSTER_M = 25;

const QUERY = `
[out:json][timeout:60];
(
  way["railway"="platform"]["train"="yes"](${BBOX});
  way["highway"="steps"](${BBOX});
  way["conveying"](${BBOX});
  way(id:${HEADHOUSE_ID});
  node["entrance"](${BBOX});
);
out geom qt;
`;

// Keep only the rail station's own doors — everything else in the bbox is a
// neighbouring tower, hotel, or PATH/subway/bus-terminal entrance. Teamways
// are the under-track pedestrian tunnels GO riders use from the south side.
const ENTRANCE_INCLUDE = /^Union Station|Teamway/;
const ENTRANCE_EXCLUDE = /Bus Terminal|PATH|Skybridge|Subway/i;

async function fetchOverpass() {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'go-train-status-map-generator/1.0 (github.com/jasonzzx/go-train-status)',
    },
    body: `data=${encodeURIComponent(QUERY)}`,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  return res.json();
}

function centroidOf(points) {
  const n = points.length;
  return points.reduce(([x, y], p) => [x + p[0] / n, y + p[1] / n], [0, 0]);
}

function distPointToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distPointToLine(p, pts) {
  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    min = Math.min(min, distPointToSegment(p, pts[i], pts[i + 1]));
  }
  return min;
}

function main(data) {
  const els = data.elements;
  const platformsRaw = els.filter((e) => e.tags?.railway === 'platform' && e.tags?.train === 'yes');
  const stepsRaw = els.filter((e) => e.type === 'way' && (e.tags?.highway === 'steps' || e.tags?.conveying));
  const headhouse = els.find((e) => e.id === HEADHOUSE_ID);
  const entrancesRaw = els.filter((e) => {
    if (e.type !== 'node' || !e.tags?.entrance) return false;
    const text = `${e.tags.name ?? ''} ${e.tags.description ?? ''}`;
    return ENTRANCE_INCLUDE.test(text) && !ENTRANCE_EXCLUDE.test(text);
  });

  if (platformsRaw.length < 5) throw new Error(`Only ${platformsRaw.length} platforms found — OSM data changed?`);

  // --- Projection: lat/lon → metres east/north around the platform centroid.
  const allPlatformNodes = platformsRaw.flatMap((p) => p.geometry);
  const lat0 = allPlatformNodes.reduce((s, n) => s + n.lat, 0) / allPlatformNodes.length;
  const lon0 = allPlatformNodes.reduce((s, n) => s + n.lon, 0) / allPlatformNodes.length;
  const mPerDegLon = M_PER_DEG_LON_EQ * Math.cos((lat0 * Math.PI) / 180);
  const toMetres = (n) => [(n.lon - lon0) * mPerDegLon, (n.lat - lat0) * M_PER_DEG_LAT];

  // Rotation: align the longest platform way (the rail corridor axis) with
  // the x-axis, so the map reads west→east left→right with Front St. on top.
  const longest = platformsRaw
    .map((p) => ({ p, pts: p.geometry.map(toMetres) }))
    .sort((a, b) => {
      const span = (pts) => Math.hypot(pts.at(-1)[0] - pts[0][0], pts.at(-1)[1] - pts[0][1]);
      return span(b.pts) - span(a.pts);
    })[0].pts;
  let rotRad = -Math.atan2(longest.at(-1)[1] - longest[0][1], longest.at(-1)[0] - longest[0][0]);
  // Normalize so we never flip the map upside down.
  if (rotRad > Math.PI / 2) rotRad -= Math.PI;
  if (rotRad < -Math.PI / 2) rotRad += Math.PI;

  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  // Metres east/north → rotated frame; y negated so north is up in SVG space.
  const toFrame = (n) => {
    const [mx, my] = toMetres(n);
    return [mx * cos - my * sin, -(mx * sin + my * cos)];
  };

  const platformLines = platformsRaw.map((p) => ({
    refs: p.tags.ref
      .split(/[;,]/)
      .map((r) => r.trim())
      .filter(Boolean),
    operator: p.tags.operator ?? '',
    construction: p.tags.construction === 'platform',
    pts: p.geometry.map(toFrame),
  }));

  // --- Bounds from the platforms; everything else clips to this frame.
  const boundPts = platformLines.flatMap((p) => p.pts);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of boundPts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  minX -= PADDING_M; maxX += PADDING_M;
  minY -= PADDING_M * 2.2; maxY += PADDING_M; // extra headroom for the headhouse/Front St. edge
  const scale = VIEWBOX_WIDTH / (maxX - minX);
  const viewBoxHeight = Math.round((maxY - minY) * scale);

  const toMap = ([x, y]) => [
    Math.round((x - minX) * scale * 10) / 10,
    Math.round((y - minY) * scale * 10) / 10,
  ];
  const mapLine = (pts) => pts.map(toMap);

  // --- Concourse→platform access points: stairs/escalators sitting on a
  // platform centreline, clustered so several parallel flights collapse to
  // one marker.
  const accessPoints = [];
  for (const s of stepsRaw) {
    if (!s.geometry || s.geometry.length === 0) continue;
    const mid = toFrame(s.geometry[Math.floor(s.geometry.length / 2)]);
    let best = null;
    let bestDist = Infinity;
    for (const p of platformLines) {
      const d = distPointToLine(mid, p.pts);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    if (bestDist > ACCESS_MAX_DIST_M || !best) continue;
    const escalator = Boolean(s.tags?.conveying);
    const cluster = accessPoints.find(
      (a) => a.platform === best && Math.hypot(a.sumX / a.count - mid[0], a.sumY / a.count - mid[1]) < ACCESS_CLUSTER_M
    );
    if (cluster) {
      cluster.sumX += mid[0]; cluster.sumY += mid[1]; cluster.count += 1;
      cluster.escalator ||= escalator;
    } else {
      accessPoints.push({ platform: best, sumX: mid[0], sumY: mid[1], count: 1, escalator });
    }
  }

  const access = accessPoints.map((a) => {
    const [x, y] = toMap([a.sumX / a.count, a.sumY / a.count]);
    return { refs: a.platform.refs, x, y, escalator: a.escalator, flights: a.count };
  });

  // Concourse band: the under-track zone the stairs descend into. Its extent
  // is the access-point cloud — the concourses reach exactly as far as their
  // stairs do.
  const concourseBand = {
    x0: Math.min(...access.map((a) => a.x)) - 12,
    x1: Math.max(...access.map((a) => a.x)) + 12,
    y0: Math.min(...access.map((a) => a.y)) - 6,
    y1: Math.max(...access.map((a) => a.y)) + 6,
  };

  const entrances = entrancesRaw.map((e) => {
    const [x, y] = toMap(toFrame(e));
    return {
      name: e.tags.name ?? 'Entrance',
      description: e.tags.description ?? '',
      level: e.tags.level ?? '',
      x, y,
      lat: e.lat, lon: e.lon,
    };
  });

  // Teamway corridors: vertical under-track tunnels, reconstructed by joining
  // each teamway's north/south entrance pair.
  const teamways = [];
  for (const name of ['York East Teamway', 'Bay West Teamway']) {
    const ends = entrances.filter((e) => `${e.name} ${e.description}`.includes(name));
    if (ends.length >= 2) {
      const ys = ends.map((e) => e.y);
      const xs = ends.map((e) => e.x);
      teamways.push({
        name,
        x: xs.reduce((s, v) => s + v, 0) / xs.length,
        y0: Math.min(...ys),
        y1: Math.max(...ys),
      });
    }
  }

  return {
    attribution: 'Map data © OpenStreetMap contributors (ODbL)',
    source: 'https://www.openstreetmap.org/copyright',
    generatedAt: new Date().toISOString().slice(0, 10),
    viewBox: { width: VIEWBOX_WIDTH, height: viewBoxHeight },
    // Everything needed to project a lat/lon into viewBox coordinates.
    transform: {
      lat0, lon0,
      mPerDegLat: M_PER_DEG_LAT,
      mPerDegLon,
      rotRad,
      scale,
      offsetX: -minX,
      offsetY: -minY,
    },
    metresPerUnit: 1 / scale,
    platforms: platformLines.map((p) => ({
      refs: p.refs,
      construction: p.construction,
      operator: p.operator,
      points: mapLine(p.pts),
    })),
    concourseBand,
    teamways,
    headhouse: headhouse ? mapLine(headhouse.geometry.map(toFrame)) : [],
    platformAccess: access,
    entrances,
  };
}

const data = await fetchOverpass();
const output = main(data);
const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/union-station-map.json');
await writeFile(outPath, JSON.stringify(output, null, 1) + '\n');
console.log(
  `Wrote ${outPath}: ${output.platforms.length} platforms, ${output.teamways.length} teamways, ` +
  `${output.platformAccess.length} access points, ${output.entrances.length} entrances, ` +
  `viewBox ${output.viewBox.width}x${output.viewBox.height}`
);
