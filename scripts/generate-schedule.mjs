#!/usr/bin/env node
/**
 * Downloads the GO Transit GTFS feed and extracts Stouffville line schedules
 * for all stations. Writes the result to src/data/stouffville-schedule.json.
 *
 * Run: node scripts/generate-schedule.mjs
 */

import { execSync } from 'child_process';
import { mkdirSync, createReadStream, createWriteStream } from 'fs';
import { writeFile, unlink, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { get } from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '..', 'src', 'data', 'stouffville-schedule.json');
const GTFS_URL = 'https://assets.metrolinx.com/raw/upload/v1683228856/Documents/Metrolinx/Open%20Data/GO-GTFS.zip';

// ── Station mappings ───────────────────────────────────────────────────────────

// Train stop codes on the Stouffville line (GTFS stop_id = our station code)
const TRAIN_STOP_CODES = new Set(['UN', 'KE', 'AG', 'MK', 'UI', 'CE', 'MR', 'MJ', 'ST', 'LI']);

// GTFS bus stop_id → our station code (bus stops near GO stations on route 71)
const BUS_STOP_TO_CODE = {
  '02300': 'UN',  // Union Station Bus Terminal
  '00128': 'UI',  // Unionville GO Bus
  '02141': 'UI',  // Unionville GO Bus (secondary)
  '02144': 'UI',  // YMCA Blvd @ Kennedy Rd (Unionville)
  '00124': 'CE',  // Bullock Dr @ McCowan Rd (Centennial GO)
  '00125': 'CE',  // Bullock Dr @ McCowan Rd (Centennial GO, northbound)
  '00122': 'MR',  // Main St N @ Station St (Markham GO)
  '00123': 'MR',  // Main St N @ Ramona Blvd (Markham GO, northbound)
  '00121': 'MJ',  // Mount Joy GO Bus
  '02830': 'LI',  // Old Elm GO Bus
  '08045': 'LI',  // Old Elm GO Bus (northbound)
};

const TRAIN_ROUTE = '06260926-ST';
const BUS_ROUTE   = '06260926-71';

// Representative dates — one per service type from the feed's active window
const SERVICE_DATES = {
  weekday:  '20260616',  // Mon Jun 16
  saturday: '20260620',  // Sat Jun 20
  sunday:   '20260621',  // Sun Jun 21
};

// ── CSV reader ─────────────────────────────────────────────────────────────────

async function readCsv(filePath) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    const cols = parseCsvLine(line);
    if (!headers) {
      headers = cols.map(h => h.replace(/^﻿/, '').trim());
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
    if (ch === '"') { inQuote = !inQuote; }
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

// ── Main ───────────────────────────────────────────────────────────────────────

const zipPath = join(tmpdir(), `go-gtfs-${Date.now()}.zip`);
const extractDir = join(tmpdir(), `go-gtfs-${Date.now()}`);

try {
  console.log('Downloading GO Transit GTFS...');
  await downloadFile(GTFS_URL, zipPath);
  console.log('Extracting GTFS...');
  mkdirSync(extractDir, { recursive: true });
  execSync(`unzip -q "${zipPath}" -d "${extractDir}"`);

  console.log('Reading GTFS files...');

  // Load relevant trips
  const allTrips = await readCsv(join(extractDir, 'trips.txt'));
  const trips = {};
  for (const t of allTrips) {
    if (t.route_id === TRAIN_ROUTE || t.route_id === BUS_ROUTE) {
      trips[t.trip_id] = t;
    }
  }
  console.log(`Loaded ${Object.keys(trips).length} Stouffville trips total`);

  // Load stop_times for our trips, mapping to station codes
  const allStopTimes = await readCsv(join(extractDir, 'stop_times.txt'));
  const tripStops = {};
  for (const st of allStopTimes) {
    if (!(st.trip_id in trips)) continue;
    const isTrainStop = TRAIN_STOP_CODES.has(st.stop_id);
    const busCode = BUS_STOP_TO_CODE[st.stop_id];
    if (!isTrainStop && !busCode) continue;
    const code = isTrainStop ? st.stop_id : busCode;
    if (!tripStops[st.trip_id]) tripStops[st.trip_id] = {};
    // Keep earliest occurrence when multiple bus stops map to same station
    const time = st.departure_time.slice(0, 5);
    const existing = tripStops[st.trip_id][code];
    if (!existing || time < existing) {
      tripStops[st.trip_id][code] = time;
    }
  }

  // Build schedule per service type
  const schedule = { effectiveDate: '2026-06-15' };

  for (const [svcType, date] of Object.entries(SERVICE_DATES)) {
    const sb = [];
    const nb = [];

    for (const [tid, trip] of Object.entries(trips)) {
      if (!tid.startsWith(date)) continue;
      const stops = tripStops[tid];
      if (!stops || Object.keys(stops).length < 2) continue;

      const vehicleType = trip.route_id === BUS_ROUTE ? 'bus' : 'train';
      const entry = { tripId: tid, vehicleType, stopTimes: stops };

      if (trip.direction_id === '1') sb.push(entry);
      else nb.push(entry);
    }

    // Sort by earliest stop time
    const firstTime = (t) => Object.values(t.stopTimes).sort()[0];
    sb.sort((a, b) => firstTime(a).localeCompare(firstTime(b)));
    nb.sort((a, b) => firstTime(a).localeCompare(firstTime(b)));

    schedule[svcType] = { sb, nb };
    console.log(`${svcType}: ${sb.length} SB, ${nb.length} NB trips`);
  }

  mkdirSync(join(__dirname, '..', 'src', 'data'), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(schedule, null, 2));
  console.log(`\nWritten to ${OUT_FILE}`);
} finally {
  await unlink(zipPath).catch(() => {});
  await rm(extractDir, { recursive: true, force: true }).catch(() => {});
}
