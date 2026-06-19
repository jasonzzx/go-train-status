# GO Train Status — Stouffville Line

A mobile-first PWA for the GO Transit Stouffville line between **Unionville GO** and **Union Station**. Shows live departure schedules, real-time platform/delay status, service alerts, and expandable stop-by-stop breakdowns.

Live: https://go-train-status.vercel.app/

---

## Tech Stack

- **Next.js 14** (App Router, `'use client'` page)
- **TypeScript**
- **Tailwind CSS** with GO Transit colour palette
- **Vercel** for hosting (auto-deploys from GitHub `main`)

---

## Project Structure

```
src/
  app/
    page.tsx              # Main UI — schedule list, TrainCard, all client state
    layout.tsx            # Root layout, PWA meta tags, embeds build version
    VersionWatcher.tsx     # Client poller — auto-reloads when a new deploy is detected
    icon.tsx               # 32×32 favicon (next/og ImageResponse)
    apple-icon.tsx          # 180×180 Apple touch icon
    globals.css            # Tailwind base styles
    api/
      tracker/route.ts    # GET /api/tracker — live platform + delay from railsix.com
      alerts/route.ts     # GET /api/alerts  — service alerts from GO Transit RSS
  lib/
    schedule-data.ts      # Static timetable (scraped from gotransit.com), stop lists, getStops()
scripts/
  write-version.mjs       # Generates public/version.json (timestamp + git SHA) on every build
public/
  manifest.json           # PWA manifest (icons, theme colours)
  logo.svg                # App icon source SVG
  icons/                  # PNG icon exports (15 sizes, generated from logo.svg via cairosvg)
  personal-icons/         # Author logo assets shown in the footer
  version.json            # Build-time version stamp (generated, gitignored)
```

---

## Data Sources

### Schedule (`src/lib/schedule-data.ts`)
Static weekday timetable for the Stouffville line, effective **June 13, 2026**. Scraped manually from [gotransit.com](https://www.gotransit.com). Saturday/Sunday arrays are empty (the line runs buses on weekends — fill in as needed).

`vehicleType: 'train' | 'bus'` distinguishes train trips (41 min, 3 intermediate stops) from express bus trips (direct, no intermediate stops).

### Live Tracker (`/api/tracker`)
Fetches both direction pages from [railsix.com](https://railsix.com) in parallel:
- `https://railsix.com/routes/unionville-to-union` (SB / homeToOffice)
- `https://railsix.com/routes/union-to-unionville` (NB / officeToHome)

railsix.com is a SvelteKit SSR app — trip data is embedded as:
```js
__sveltekit_XXXX.resolve(1, () => [[{ scheduledAt, actualAt, platform, status, stops, ... }]])
```
The route extracts this with regex, converts JS object-literal keys to JSON, and returns a `TrackerTrip[]` array. Set `export const dynamic = 'force-dynamic'` and `cache: 'no-store'` so Vercel never caches stale data.

### Service Alerts (`/api/alerts`)
Fetches the GO Transit service alerts RSS feed and parses it with `cheerio`.

---

## Intermediate Stops

Trains on the Stouffville line stop at **Milliken GO → Agincourt GO → Kennedy GO** between Unionville and Union. Bus trips are direct (no intermediate stops).

Stop times are estimated by fractional offsets defined in `schedule-data.ts`:

```ts
// SB (~41 min): UI=0, ML≈7min (0.17), AO≈12min (0.29), KE≈20min (0.49), UN=1.0
const TRAIN_SB_FRACTIONS = [0, 0.17, 0.29, 0.49, 1.0];
```

When `trackerTrips` includes a `stops: string[]` for a trip (live data from railsix), those station names override the hardcoded list via the `liveStops` prop on `TrainCard`.

> **Note:** Scarborough GO and Danforth GO are on the **Lakeshore East** line, not Stouffville.

---

## Tailwind Colours

Custom GO Transit palette in `tailwind.config.ts`:

| Token | Hex | Usage |
|---|---|---|
| `go-green` | `#00853F` | Next train card background, active elements |
| `go-dark` | `#003B27` | Header background |
| `go-light` | `#E8F5EE` | Subtle green tints |
| `go-accent` | `#F5A623` | "Next" badge, platform badge |

---

## Auto-Update on Deploy

Since this is an installed PWA (standalone mode on iOS/Android), browsers can keep serving a stale cached build indefinitely after a new deploy. To fix that:

- `scripts/write-version.mjs` runs as a `prebuild` step and writes `public/version.json` with a `{timestamp}-{gitSha}` version string on every build.
- `next.config.mjs` sets `Cache-Control: no-cache, no-store, must-revalidate` on `/`, `/manifest.json`, and `/version.json` so the HTML shell and version probe are never cached.
- `layout.tsx` reads `public/version.json` at build time and passes it into `VersionWatcher`, a client component that polls `/version.json` every 60s (plus on tab focus/visibility change) and calls `window.location.reload()` if the server's version no longer matches the one baked into the page.

Result: any open tab or installed PWA picks up a new deployment automatically, without the user needing to force-quit and relaunch the app.

---

## Key Features

- **Direction toggle** — Unionville → Union / Union → Unionville
- **Date picker** — browse any date's schedule
- **"Next" badge** — highlights the next departure
- **"Now" badge + On Board** — amber pulsing badge and expandable progress view for in-progress trains
- **Expandable stop list** — shows intermediate stations with estimated times and a live position indicator
- **Platform + delay badges** — pulled from railsix.com every 30 seconds
- **Service alerts sheet** — bottom sheet with GO Transit alerts
- **Add to Home Screen banner** — detects iOS Safari vs Android Chrome and shows install prompt
- **PWA** — installable, standalone display mode, custom icon

---

## Local Development

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build + type check
```

Deploy is via `push.sh` (commits and pushes to GitHub, Vercel auto-deploys):

```bash
bash push.sh
```

---

## Extending

Some natural next features:

- **Weekend timetables** — `scheduleData.homeToOffice.saturday` / `.sunday` arrays are empty stubs ready to fill
- **Push notifications** — alert user when their next train is delayed
- **Multi-line support** — the data model (`Direction`, `Trip`, `StationStop`) is generic; swap out the station list and schedule arrays
- **GTFS integration** — replace the static timetable with the GO Transit GTFS feed for automatic schedule updates
- **Favourite stops** — persist direction preference to localStorage
