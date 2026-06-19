#!/usr/bin/env node
/**
 * Downloads the GO Transit GTFS feed and extracts schedules for every GO rail
 * line configured in line-gtfs-config.mjs. Writes one JSON per line to
 * src/data/schedules/{ID}.json.
 *
 * Each line's full station list, geographic order, display names and railsix
 * slugs are derived directly from the GTFS feed — only the optional bus-stop
 * mapping is hand-configured. Train routes are matched by route_short_name so
 * the extraction survives GTFS feed-version changes (route_ids are datestamped).
 *
 * Run: node scripts/generate-schedule.mjs
 */

import { execSync } from 'child_process';
import { mkdirSync, createReadStream, createWriteStream } from 'fs';
import { writeFile, unlink, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { get } from 'https';
import { LINE_GTFS_CONFIG } from './line-gtfs-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data', 'schedules');
const GTFS_URL =
  'https://assets.metrolinx.com/raw/upload/v1683228856/Documents/Metrolinx/Open%20Data/GO-GTFS.zip';

const UNION = 'UN';

// ── CSV reader ─────────────────────────────────────────────────────────────────

async function readCsv(filePath) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    const cols = parseCsvLine(line);
    if (!headers) {
      headers = cols.map((h) => h.replace(/^﻿/, '').trim());
      continue;
    }
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] ?? '').trim(); });
    rows.push(obj);
  }
  return rows;
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// ── Download ───────────────────────────────────────────────────────────────────

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} from ${u}`));
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on('finish', resolve);
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

// ── Display helpers (derive names/slugs from GTFS stop names) ────────────────────

function displayName(stopName) {
  // "Union Station GO" is the office hub — show without the " GO" suffix.
  return stopName === 'Union Station GO' ? 'Union Station' : stopName;
}

function shortName(name) {
  return name.replace(/ GO$/, '').replace(/ Station$/, '').trim();
}

function railsixSlug(name) {
  return shortName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Date selection (busiest Mon/Sat/Sun, robust to holidays & feed updates) ──────

function pickServiceDates(trainTripIds) {
  // trip_id looks like "20260616-ST-7127" — first token is YYYYMMDD.
  const countByDate = new Map();
  for (const tid of trainTripIds) {
    const date = tid.slice(0, 8);
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
  }
  const best = {}; // dow → { date, count }
  for (const [date, count] of countByDate) {
    const y = +date.slice(0, 4), m = +date.slice(4, 6), d = +date.slice(6, 8);
    const dow = new Date(y, m - 1, d).getDay(); // 0 Sun … 6 Sat
    const kind = dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'weekday';
    if (!best[kind] || count > best[kind].count) best[kind] = { date, count };
  }
  return {
    weekday: best.weekday?.date,
    saturday: best.saturday?.date,
    sunday: best.sunday?.date,
  };
}

// ── Per-line extraction ──────────────────────────────────────────────────────────

function buildLine(id, cfg, ctx) {
  const { routesByShort, trips, tripStops, stopNames } = ctx;

  const trainRouteId = routesByShort.get(cfg.routeShortName);
  if (!trainRouteId) throw new Error(`No train route for short_name ${cfg.routeShortName}`);

  const busRouteIds = new Set(
    (cfg.busRoutes ?? []).map((s) => routesByShort.get(s)).filter(Boolean),
  );

  // Trips belonging to this line (train + configured buses)
  const lineTrips = [];
  for (const [tid, t] of trips) {
    if (t.route_id === trainRouteId) lineTrips.push({ tid, vehicleType: 'train' });
    else if (busRouteIds.has(t.route_id)) lineTrips.push({ tid, vehicleType: 'bus' });
  }

  // Map each trip's stops to station codes (+ time), honoring the bus stop map.
  const busStopMap = cfg.busStopMap ?? {};
  const tripStopTimes = new Map(); // tid → { code → "HH:MM" }
  for (const { tid, vehicleType } of lineTrips) {
    const seq = tripStops.get(tid);
    if (!seq) continue;
    const out = {};
    for (const { stopId, time } of seq) {
      let code = null;
      if (vehicleType === 'train') {
        code = stopId; // train stop_ids are the station codes
      } else if (busStopMap[stopId]) {
        code = busStopMap[stopId];
      }
      if (!code) continue;
      // keep earliest time when several stops map to one station
      if (!out[code] || time < out[code]) out[code] = time;
    }
    if (Object.keys(out).length >= 2) tripStopTimes.set(tid, out);
  }

  // Derive geographic station order: average stop_sequence away from Union
  // (direction_id = 0) across all train trips. Robust for branches/extensions.
  const seqSamples = new Map(); // code → number[]
  for (const { tid, vehicleType } of lineTrips) {
    if (vehicleType !== 'train') continue;
    if (trips.get(tid).direction_id !== '0') continue;
    for (const { stopId, seq } of tripStops.get(tid) ?? []) {
      if (!seqSamples.has(stopId)) seqSamples.set(stopId, []);
      seqSamples.get(stopId).push(seq);
    }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  // Union-first order (ascending distance from Union); reverse for outward→Union.
  const unionFirst = [...seqSamples.keys()].sort(
    (a, b) => avg(seqSamples.get(a)) - avg(seqSamples.get(b)),
  );
  const outwardToUnion = [...unionFirst].reverse(); // farthest station → Union

  const stations = outwardToUnion.map((code) => {
    const name = displayName(stopNames.get(code) ?? code);
    return { code, name, shortName: shortName(name), railsixSlug: railsixSlug(name) };
  });

  // Build per-service-type, per-direction trip lists.
  const trainTripIds = lineTrips.filter((x) => x.vehicleType === 'train').map((x) => x.tid);
  const dates = pickServiceDates(trainTripIds);

  const out = {
    id,
    effectiveDate: ctx.effectiveDate,
    stations, // outward → Union (last entry is Union Station)
  };

  for (const svc of ['weekday', 'saturday', 'sunday']) {
    const date = dates[svc];
    const toUnion = [];
    const fromUnion = [];
    if (date) {
      for (const { tid, vehicleType } of lineTrips) {
        if (!tid.startsWith(date)) continue;
        const stopTimes = tripStopTimes.get(tid);
        if (!stopTimes || !(UNION in stopTimes)) continue;
        const entry = { tripId: tid, vehicleType, stopTimes };
        if (trips.get(tid).direction_id === '1') toUnion.push(entry);
        else fromUnion.push(entry);
      }
    }
    const first = (t) => Object.values(t.stopTimes).sort()[0];
    toUnion.sort((a, b) => first(a).localeCompare(first(b)));
    fromUnion.sort((a, b) => first(a).localeCompare(first(b)));
    out[svc] = { toUnion, fromUnion };
  }

  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────────

const zipPath = join(tmpdir(), `go-gtfs-${Date.now()}.zip`);
const extractDir = join(tmpdir(), `go-gtfs-${Date.now()}`);

try {
  console.log('Downloading GO Transit GTFS…');
  await downloadFile(GTFS_URL, zipPath);
  console.log('Extracting…');
  mkdirSync(extractDir, { recursive: true });
  execSync(`unzip -q "${zipPath}" -d "${extractDir}"`);

  console.log('Reading GTFS…');
  const routes = await readCsv(join(extractDir, 'routes.txt'));
  const routesByShort = new Map(routes.map((r) => [r.route_short_name, r.route_id]));

  const stopNames = new Map();
  for (const s of await readCsv(join(extractDir, 'stops.txt'))) {
    stopNames.set(s.stop_id, s.stop_name);
  }

  // Which route_ids do we care about (all configured train + bus routes)?
  const wantedRouteIds = new Set();
  for (const cfg of Object.values(LINE_GTFS_CONFIG)) {
    const tr = routesByShort.get(cfg.routeShortName);
    if (tr) wantedRouteIds.add(tr);
    for (const b of cfg.busRoutes ?? []) {
      const br = routesByShort.get(b);
      if (br) wantedRouteIds.add(br);
    }
  }

  const trips = new Map();
  for (const t of await readCsv(join(extractDir, 'trips.txt'))) {
    if (wantedRouteIds.has(t.route_id)) trips.set(t.trip_id, t);
  }

  const tripStops = new Map(); // tid → [{ stopId, seq, time }]
  {
    const rl = createInterface({
      input: createReadStream(join(extractDir, 'stop_times.txt')),
      crlfDelay: Infinity,
    });
    let headers = null;
    let idx = {};
    for await (const line of rl) {
      const cols = parseCsvLine(line);
      if (!headers) {
        headers = cols.map((h) => h.replace(/^﻿/, '').trim());
        idx = {
          trip: headers.indexOf('trip_id'),
          stop: headers.indexOf('stop_id'),
          seq: headers.indexOf('stop_sequence'),
          dep: headers.indexOf('departure_time'),
        };
        continue;
      }
      const tid = cols[idx.trip];
      if (!trips.has(tid)) continue;
      if (!tripStops.has(tid)) tripStops.set(tid, []);
      tripStops.get(tid).push({
        stopId: cols[idx.stop],
        seq: +cols[idx.seq],
        time: (cols[idx.dep] ?? '').slice(0, 5),
      });
    }
  }

  const feedInfo = await readCsv(join(extractDir, 'feed_info.txt')).catch(() => []);
  const effectiveDate = feedInfo[0]?.feed_start_date
    ? `${feedInfo[0].feed_start_date.slice(0, 4)}-${feedInfo[0].feed_start_date.slice(4, 6)}-${feedInfo[0].feed_start_date.slice(6, 8)}`
    : new Date().toISOString().slice(0, 10);

  const ctx = { routesByShort, trips, tripStops, stopNames, effectiveDate };

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\nEffective date: ${effectiveDate}\n`);

  for (const [id, cfg] of Object.entries(LINE_GTFS_CONFIG)) {
    const line = buildLine(id, cfg, ctx);
    await writeFile(join(OUT_DIR, `${id}.json`), JSON.stringify(line, null, 2));
    const wk = line.weekday;
    console.log(
      `${id}: ${line.stations.length} stations, ` +
        `${wk.toUnion.length}→Union / ${wk.fromUnion.length}←Union weekday trips`,
    );
  }

  console.log(`\nWritten ${Object.keys(LINE_GTFS_CONFIG).length} line files to ${OUT_DIR}`);
} finally {
  await unlink(zipPath).catch(() => {});
  await rm(extractDir, { recursive: true, force: true }).catch(() => {});
}
