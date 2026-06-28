// ── Raw wire shapes for the official Metrolinx Open Data API ───────────────
// Field names, nesting and value types below were VALIDATED against live JSON
// payloads (api.openmetrolinx.com, 2026-06) — see docs/api-migration-plan.md.
// Values are JSON-native: some fields arrive as numbers/booleans, not strings.

/** ServiceataGlance/Trains/All → Trips.Trip[] (currently-live train trips). */
export interface RawLiveTrain {
  TripNumber?: string;
  LineCode?: string;        // e.g. "LW"; Kitchener is "GT" (see metrolinxLineCode)
  Cars?: string;
  StartTime?: string;       // "HH:MM"
  EndTime?: string;         // "HH:MM"
  RouteNumber?: string;
  VariantDir?: string;
  Display?: string;         // destination sign, e.g. "LW - Union Station"
  Latitude?: number;
  Longitude?: number;
  Course?: number;
  IsInMotion?: boolean;
  DelaySeconds?: number;    // deviation from schedule, seconds (positive = late)
  FirstStopCode?: string;
  LastStopCode?: string;
  PrevStopCode?: string;
  NextStopCode?: string;
  AtStationCode?: string | null;
  ModifiedDate?: string;
}

/** ServiceUpdate/UnionDepartures/All → AllDepartures.Trip[] (w/ platform). */
export interface RawUnionDeparture {
  TripNumber?: string;
  Platform?: string;        // "-" when not yet assigned; may be "7 & 8"
  Service?: string;         // full line name, e.g. "Lakeshore West" (not a code)
  ServiceType?: string;     // "T" = train
  Time?: string;            // "YYYY-MM-DD HH:MM:SS"
  Info?: string;
  Stops?: unknown;          // [{ Name, Code }]
}

/** ServiceUpdate/Exceptions/Train → top-level Trip[] (cancelled / modified). */
export interface RawExceptionTrain {
  TripNumber?: string;      // GTFS number ("7209") or exception variant ("E7209")
  TripName?: string;
  IsCancelled?: string;     // "0" / "1"
  IsOverride?: string;      // "0" / "1"
  Stop?: unknown;           // per-stop overrides (unused)
}

/** ServiceUpdate/ServiceAlert/All → Messages.Message[]. */
export interface RawAlertMessage {
  Code?: string;
  ParentCode?: string | null;
  Status?: string;
  PostedDateTime?: string;
  SubjectEnglish?: string;
  SubjectFrench?: string;
  BodyEnglish?: string;
  BodyFrench?: string;
  Category?: string;
  SubCategory?: string;
  Lines?: RawAlertLine[];   // direct array of { Code }, not { Line: [...] }
  Stops?: unknown;
  Trips?: unknown;
}

/** Nested Message.Lines[] entry. */
export interface RawAlertLine {
  Code?: string;
}
