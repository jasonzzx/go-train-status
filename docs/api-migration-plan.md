# Migration Plan: railsix/scraping → official Metrolinx Open API

> **Status:** Code IMPLEMENTED but UNVERIFIED. The `src/lib/metrolinx/` client +
> wrappers and the official paths in `/api/tracker` and `/api/alerts` are written
> and build/typecheck clean, but the field mapping has **never been validated
> against a live payload** — every sandbox session so far (incl. this one) is
> denied egress to `api.openmetrolinx.com` (403 at the proxy). The official path
> is therefore gated behind a default-off flag with the legacy scrapers as
> fallback, so nothing regresses. See **Implementation status** below.
>
> **API key:** `30028586` (issued by Metrolinx to jasonzzx@gmail.com).
> Store it as an env var (`METROLINX_API_KEY`), never hardcode.

## Implementation status (what's done)

New module `src/lib/metrolinx/`:
- `client.ts` — base fetch w/ `?key=` injection from `METROLINX_API_KEY`, a
  `metrolinxEnabled()` flag (`METROLINX_API_ENABLED` = `1`/`true` **and** a key
  set), a 300/sec token-bucket rate limiter, a short-TTL in-memory cache +
  in-flight de-dupe, and `toArray`/`listFrom` helpers for the
  `{Plural:{Singular:[...]}}` envelope.
- `types.ts` — raw PascalCase wire shapes (field names from the
  `go_transit_ruby` wrapper, **not** a live payload).
- `trains.ts` — `ServiceataGlance/Trains/All`, `ServiceUpdate/UnionDepartures/All`,
  `ServiceUpdate/Exceptions/Train`, merged into `tripNumber → LiveTrainStatus`.
- `alerts.ts` — `ServiceUpdate/ServiceAlert/All`, filtered by `Message.Lines[].Code`.

Routes (`src/app/api/{tracker,alerts}/route.ts`): when `metrolinxEnabled()`, try
the official path first; on **error** fall back to the existing scrapers. The
scraping code is intentionally KEPT (not removed as originally planned) until the
official path is verified. `page.tsx` now passes `&code={lineId}` to `/api/tracker`
so the official path can scope to the line.

### Enabling + verifying (do this in a network-enabled session)
1. Run the connectivity check below; it must return data (not 403).
2. Set env: `METROLINX_API_KEY=30028586` and `METROLINX_API_ENABLED=1`.
3. `curl` each endpoint, save sample JSON, and **confirm the exact JSON key
   casing + envelope nesting** against `src/lib/metrolinx/types.ts` and the
   `listFrom(...,'Trips','Trip')` / `'Messages','Message'` calls — adjust if wrong.
4. Confirm Metrolinx `LineCode` values match our line ids (ST/LW/LE/BR/RH/KI/MI).
5. `npm run dev`, diff `/api/tracker?home=…&code=ST` and `/api/alerts?code=ST`
   against the scraper output (flag off) for parity.

### Known gaps vs. the railsix scraper (resolve during verification)
- **Inbound platform:** railsix gave a boarding platform for both directions;
  the official path only has platform for **Union departures** (outbound/NB).
  Inbound (SB, home→Union) platform is `""` unless we add per-trip
  `Schedule/Trip/{date}/{tripNumber}` calls (rate-limited). Decide then.
- **Live downstream stops:** `stops` is `[]` on the official path (page falls
  back to static GTFS stops). ServiceataGlance gives prev/next stop codes, not a
  list — derive from schedule progress later if the live stop list is wanted.
- **Upcoming vs. live:** ServiceataGlance only lists currently-active trips, so
  trips with no live signal are emitted as plain schedule rows (no badge), unlike
  railsix which showed predicted status for upcoming trains.

## Goal

Replace the two unreliable scraped data sources with official Metrolinx Open API
calls, for a more reliable feed:

1. **Live tracker** — currently scrapes `railsix.com` SvelteKit HTML in
   `src/app/api/tracker/route.ts`.
2. **Alerts** — currently scrapes `gotransit.com` (primary) / `railsix.com/alerts`
   (fallback) in `src/app/api/alerts/route.ts`.

GTFS **static schedule** generation (`scripts/generate-schedule.mjs`) already uses
the official `assets.metrolinx.com` GTFS ZIP, so it is canonical — keep it unless
the official `Schedule/Line` API proves materially better.

Also: add a rate limiter (API limit is **300 calls/sec**; 429s or excessive bad
calls risk key suspension), use an env var for the key, and refactor the
data-source layer for maintainability.

## Connectivity check (run FIRST in a network-enabled session)

```bash
export CURL_CA_BUNDLE=/root/.ccr/ca-bundle.crt
KEY=30028586; BASE=https://api.openmetrolinx.com/OpenDataAPI
curl -s -m 30 "$BASE/api/V1/ServiceataGlance/Trains/All?key=$KEY" | head -c 2000
```
If this 403s at the proxy, the session still has the old network policy — start a
fresh session.

## Official API surface (confirmed via PDF + go_transit_ruby wrapper)

Base: `https://api.openmetrolinx.com/OpenDataAPI/`, every URL ends `?key=KEY`.
All feeds available as XML or JSON (GTFS feeds also protobuf). UP Express feeds
put `UP` in the path.

### Endpoints relevant to us
- `api/V1/ServiceataGlance/Trains/All` — all LIVE train trips: trip number, start/end
  times, **line code**, direction, destination sign, lat/long, **delay deviation**,
  moving flag, first/last/**current**/**next** stop code, at-stop flag, last-updated,
  **number of cars**. (No platform here.)
- `api/V1/ServiceUpdate/UnionDepartures/All` — upcoming Union departures incl.
  **platform** (only shows 10–15 min before departure), trip number, line, bus/train.
- `api/V1/ServiceUpdate/Exceptions/Train` — cancelled/modified train trips
  (also `/Bus`, `/All`).
- `api/V1/Schedule/Trip/{Date}/{TripNumber}` — per-trip: dest stop code, lat/long,
  scheduled + estimated arrival/departure per stop (with stop code), and **platform**
  for trains. Predictions/lat-long only for live trips; predictions ≤30 min ahead.
- `api/V1/ServiceUpdate/ServiceAlert/All` — system alerts, bus-stop relocations,
  route detours (by route/line), elevator notices (by line/station).
- `api/V1/ServiceUpdate/InformationAlert/All` — station construction + parking notices.
- `api/V1/Gtfs/Feed/Alerts | TripUpdate | VehiclePosition` — GTFS-RT (standard spec).
- `api/V1/Schedule/Line/{Date}/{LineCode}/{LineDirection}` and `/Line/Stop/...` and
  `/Line/All/{Date}` — schedule (potential static-gen replacement).

### Deprecated / dead (do not call)
`Fleet/*` → 403. `ServiceUpdate/MarketingAlert`, `ServiceUpdate/ServiceGuarantee`,
`ServiceataGlance/UPX` → no data.

## Consumer contract to preserve (from src/app/page.tsx)

The frontend merges live data into the GTFS schedule by **scheduled departure time**.
Do not change the API-route output shapes without updating page.tsx.

### `/api/tracker` → `TrackerResponse { trips: TrackerTrip[]; available; lastUpdated; error? }`
`TrackerTrip` fields actually consumed:
- `scheduledTime` "HH:MM" — departure from ORIGIN station (home for SB, Union for NB).
  Keyed against `trip.departure`. **Critical join key.**
- `directionCd` `'Inbound'` (toward Union / homeToOffice) | `'Outbound'` (away / officeToHome).
- `platform`, `expected` ("On Time"/"+N min"/"Cancelled"/"Waiting"), `delay` (min, ≥0),
  `cancelled`, `stops[]` (live downstream stop names), `arriveIn` (currently unused, "").
- Also present but minor: `tripNumber`, `arrivalTime`, `cars`.

page.tsx builds `inbound`/`outbound` maps keyed by `scheduledTime`
(`buildTrackerMaps`), a `trackerStopsMap` keyed `"${directionCd}:${scheduledTime}"`,
and `computeLineStatus` (minor delay if any tracker trip `cancelled || delay>0`).

### `/api/alerts` → `{ alerts: ParsedAlert[]; available; lastUpdated; error? }`
`ParsedAlert` fields consumed: `title`, `reason`, `direction`
(`'northbound'|'southbound'|'both'`), `scheduledDeparture` (used as alert-map key;
empty today so alerts aren't time-matched — only listed in the sheet). Others
(`scheduledArrival`,`status`,`fromStation`,`toStation`,`id`) exist but today are "".

## Proposed mapping (to validate against real JSON once unblocked)

### Tracker
Join the live API to our existing GTFS schedule by **trip number**. Our GTFS
`trip_id` embeds it: `20260616-ST-7127` → trip number `7127`. So:
1. `ServiceataGlance/Trains/All` → filter to the line code, build a map
   `tripNumber → { delay, cancelled?, currentStop, nextStop, cars, lastUpdated }`.
2. For the home station + direction, our schedule already knows each trip's
   `tripNumber` and scheduled departure → look up live status by trip number, emit
   `TrackerTrip` keyed by `scheduledTime = scheduled departure`.
3. **Platform:** outbound (from Union) via `UnionDepartures/All` (match trip number);
   inbound platform either from `Schedule/Trip/{date}/{tripNumber}` (per-live-trip,
   bounded by rate limiter) or omit if not available cheaply. Decide after seeing
   real payloads.
4. `cancelled` from `Exceptions/Train` (or status field in ServiceataGlance) →
   `expected='Cancelled'`. Delay>0 → `expected='+N min'`.
5. `stops[]` (live downstream) from the trip's remaining stops — derive from
   ServiceataGlance current/next stop progress or `Schedule/Trip`.

Note: ServiceataGlance is ONE call covering the whole network → far fewer calls
than the current 2 railsix pages per home-station. Cache per line for the 30s poll.

### Alerts
`ServiceUpdate/ServiceAlert/All` + `InformationAlert/All` (or GTFS-RT `Feed/Alerts`),
filter to the requested line code, map each to `ParsedAlert { title, reason,
direction:'both' }`. This drops the railsix/gotransit HTML scraping entirely.

## Rate limiter
- Limit is 300 calls/sec. Our load is tiny, but guard against accidental loops.
- Add a small shared limiter (token bucket / simple in-memory queue) in a
  `src/lib/metrolinx/` client module that ALL official calls go through.
- Add an in-memory short-TTL cache (e.g. ServiceataGlance cached ~15–25s since the
  client polls every 30s) so concurrent users collapse to one upstream call.

## Refactor target
Introduce `src/lib/metrolinx/` (or similar):
- `client.ts` — base fetch w/ key injection, XML-or-JSON, rate limiter, cache,
  graceful errors.
- `trains.ts`, `alerts.ts`, `schedule.ts` — typed wrappers per endpoint group.
- API routes become thin: call the lib, map to the existing `TrackerTrip` /
  `ParsedAlert` contracts. Remove railsix/gotransit scraping + regex.

## Verification plan (once network is open)
1. Connectivity check (above).
2. `curl` each candidate endpoint, save sample JSON under `scratchpad/`, confirm
   field names vs. this doc; adjust mapping.
3. Implement lib + routes; `npm run build` + typecheck/lint.
4. Run `npm run dev`, hit `/api/tracker?home=...` and `/api/alerts?code=ST`, diff
   against current railsix output for the same line to confirm parity.
5. Spot-check a delayed/cancelled trip if one exists live.
6. Commit; push to `main` per instructions.

## Open questions to resolve from real payloads
- Does ServiceataGlance/Trains include a usable per-trip status (to avoid a separate
  Exceptions call)?
- Cheapest reliable source of platform for INBOUND (arrival) trips — Schedule/Trip
  per trip, or is arrival platform even shown today by railsix? (railsix `platform`
  is the boarding platform; confirm what users expect per direction.)
- Keep GTFS static generation as-is, or move to `Schedule/Line` API? Default: keep
  static (already official, build-time, zero runtime cost).
