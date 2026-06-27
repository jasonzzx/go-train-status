// ── Raw wire shapes for the official Metrolinx Open Data API ───────────────
// Field names + nesting are derived from the go_transit_ruby wrapper's resource
// models (which underscore the PascalCase JSON keys). These have NOT yet been
// validated against a live payload — confirm against real JSON before relying on
// them (see docs/api-migration-plan.md). All values arrive as strings.

/** ServiceataGlance/Trains/All → Trips.Trip[] (currently-live train trips). */
export interface RawLiveTrain {
  TripNumber?: string;
  LineCode?: string;
  Cars?: string;
  StartTime?: string;
  EndTime?: string;
  Display?: string;        // destination sign
  Latitude?: string;
  Longitude?: string;
  IsInMotion?: string;
  DelaySeconds?: string;   // deviation from schedule, seconds (positive = late)
  FirstStopCode?: string;
  LastStopCode?: string;
  PrevStopCode?: string;
  NextStopCode?: string;
  AtStationCode?: string;
  ModifiedDate?: string;
  OccupancyPercentage?: string;
}

/** ServiceUpdate/UnionDepartures/All → Trips.Trip[] (Union departures w/ platform). */
export interface RawUnionDeparture {
  TripNumber?: string;
  Platform?: string;       // "-" when not yet assigned; may be "2 & 3"
  Service?: string;        // line code
  ServiceType?: string;
  Time?: string;
  Info?: string;
}

/** ServiceUpdate/Exceptions/Train → Trips.Trip[] (cancelled / modified trips). */
export interface RawExceptionTrain {
  TripNumber?: string;
  TripName?: string;
  IsCancelled?: string;    // integer-as-string; > 0 means cancelled
  IsOverride?: string;
}

/** ServiceUpdate/ServiceAlert/All → Messages.Message[]. */
export interface RawAlertMessage {
  Code?: string;
  ParentCode?: string;
  Status?: string;
  PostedDateTime?: string;
  SubjectEnglish?: string;
  SubjectFrench?: string;
  BodyEnglish?: string;
  BodyFrench?: string;
  Category?: string;
  SubCategory?: string;
  Lines?: unknown;         // { Line: [{ Code }] }
  Stops?: unknown;
  Trips?: unknown;
}

/** Nested Message.Lines.Line[] entry. */
export interface RawAlertLine {
  Code?: string;
}
