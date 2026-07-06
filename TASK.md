# UX Improvement Backlog

Prioritized by impact on the daily commuter experience, deliberately ignoring
implementation cost. From a full code review (July 2026). Check items off as
they ship.

Groundwork already done: `page.tsx` has been decomposed into tested components
(`src/components/`, 166-test suite), so the UI-wide items below (dark mode,
accessibility, favourites) can now be built as small per-component changes.
The natural next enabler is extracting the polling logic into hooks
(`useTracker` / `useAlerts` / `useSchedule`) — item 7 falls out of that almost
for free.

---

## P0 — Highest impact

- [ ] **1. Push notifications for delays, cancellations, and platform assignment**
  The single biggest win. Today the user must open the app to learn their 5:40
  is cancelled. Notify when *their* usual train is delayed/cancelled, and the
  moment its Union platform is assigned (~10–15 min out) — removes the
  departure-board huddle entirely. The server-side platform capture
  (`/api/cron/platforms`, `platform-store.ts`) already exists to build on.

- [ ] **2. Offline support (service worker)**
  There is currently **no service worker at all** — underground at Union or in
  a tunnel, the installed PWA is a blank screen exactly when a commuter needs
  it. The static GTFS schedule is already bundled; cache the app shell +
  schedule and show a "live data unavailable" banner. The app should never be
  useless offline.

- [ ] **3. Live Activities / lock-screen widget**
  A glanceable "next train 5:40 → Platform 9, departs in 12:34" on the lock
  screen (iOS Live Activity, Android widget). Most checks are 3-second glances
  while walking — this is the ideal form factor for the app.

- [ ] **4. Real vehicle positions for the On Board view**
  The "← now" indicator interpolates from schedule + delay. Metrolinx
  publishes GTFS-RT vehicle positions; real GPS would make the progress view
  trustworthy during irregular running — precisely when people check it.
  Lands in the already-clean `src/lib/metrolinx/` layer.

## P1 — High value

- [ ] **5. Arrival alert while on board**
  Vibrate/notify one stop before the user's home station. Pairs with On Board
  mode (`StationList` already computes the current segment); nap- and
  podcast-friendly.

- [ ] **6. Dark mode**
  Commuters use this at 6 a.m. and 11 p.m.; the UI is bright white cards.
  `prefers-color-scheme` support. Now unblocked by the component decomposition
  — can ship as a series of small per-component diffs.

- [ ] **7. Surface live-data failures**
  `fetchTracker` / `fetchAlerts` errors are silently swallowed (empty `catch`)
  — the UI keeps showing "Live data" with an aging timestamp. Add a visible
  "stale / reconnecting" state. Best done while extracting the fetch logic
  into hooks that return `{ data, lastUpdated, status: 'live'|'stale'|'error' }`.

- [ ] **8. Favourites / quick trip switching**
  Line + station selection takes several taps through two dropdowns. A row of
  recent line+station chips (or one-tap swap between two saved trips) for
  anyone with more than one routine. Builds on `src/lib/preferences.ts`.

- [ ] **9. Accessibility pass**
  Several touch targets are under 44 px (language toggle, refresh), status is
  often conveyed by colour alone, and emoji serve as unlabelled buttons
  (⚠️, ✕, 🏠). VoiceOver/TalkBack labels and larger hit areas matter for a
  transit audience. Also unblocked by the decomposition.

- [ ] **10. Train length / boarding position**
  The Metrolinx feed already returns car counts (`ServiceataGlance`, fetched
  but unused in the UI). "6 cars — board near the front for the Bay St. exit"
  pairs naturally with the platform map.

## P2 — Nice to have

- [ ] **11. Pull-to-refresh**
  The expected mobile gesture; refresh is currently only a small header button.

- [ ] **12. "Holiday schedule" banner**
  When the live day schedule (`/api/schedule`) silently replaces the static
  one, tell the user why today's list looks different.

- [ ] **13. Trip reliability stats**
  "This departure has been 5+ min late on 30% of recent weekdays" helps choose
  between two trains. Requires accumulating history server-side (KV store).

- [ ] **14. Connecting-trip suggestions at Union**
  For riders transferring between GO lines: show the next departure on the
  connecting line after arrival.

- [ ] **15. More languages**
  The i18n structure is ready (`src/i18n/`). Tamil, Punjabi, Tagalog, and
  Traditional Chinese are large GTA commuter language groups.
