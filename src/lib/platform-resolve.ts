// ── Departure-platform resolution ───────────────────────────────────────────
//
// INVARIANT: a platform shown on a trip card ALWAYS refers to the trip's
// DEPARTURE station — never the arrival station.
//
//   Outbound (Union → home): departure station is Union, so only Union
//   sources may be used. The home-station platform is where the train
//   ARRIVES and must never appear.
//
//   Inbound (home → Union): departure station is the home station, so only
//   home-station sources may be used. Union data for an Inbound trip number
//   (live UnionDepartures or its stored copy) is the ARRIVAL platform and
//   must never appear.
//
// Keeping this as a pure function lets platform-resolve.test.ts safeguard
// the invariant directly, independent of the network plumbing around it.

export interface PlatformSources {
  directionCd: 'Inbound' | 'Outbound';
  /** Live Union departure platform (UnionDepartures feed), '' if none. */
  unionLive: string;
  /** Union platform captured earlier today (bare trip-number store key). */
  unionStored: string;
  /** Live scheduled home-station boarding platform (Schedule/Trip). */
  homeLive: string;
  /** Stored home-station platform (`${trip}:${station}` store key). */
  homeStored: string;
  /**
   * Departure is near or already past. Gates the Inbound scheduled platform:
   * Schedule/Trip knows it all day, but a platform on a card hours before
   * departure reads as stale/untrustworthy.
   */
  depSoon: boolean;
}

/** The platform for the trip's DEPARTURE station, or '' if none is known. */
export function resolveDeparturePlatform(s: PlatformSources): string {
  if (s.directionCd === 'Outbound') {
    // GO only publishes a Union platform ~10-15 min before departure, so the
    // live/stored values are inherently near-departure — no extra gate.
    return s.unionLive || s.unionStored || '';
  }
  if (!s.depSoon) return '';
  return s.homeLive || s.homeStored || '';
}

/**
 * Platform for a railsix-scraped trip. The route page already reports the
 * departure station's platform (home→union pages show home platforms,
 * union→home pages show Union's), so direction is enforced by the CALLER
 * passing the matching `stored` value — Union-keyed for Outbound,
 * home-station-keyed for Inbound.
 */
export function resolveRailsixPlatform(opts: {
  /** Platform from the scraped page ('' if absent or '-'). */
  feedPlatform: string;
  /** Departure within the near window — railsix mirrors scheduled values all day. */
  departsSoon: boolean;
  /** Trip has already departed — stored backfill applies only then. */
  departed: boolean;
  /** Stored platform for this trip's DEPARTURE station, '' if none. */
  stored: string;
}): string {
  const live = opts.departsSoon ? opts.feedPlatform : '';
  return live || (opts.departed ? opts.stored : '');
}
