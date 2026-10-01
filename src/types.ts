/** A calendar date in ISO format, e.g. "2026-03-14". Time zones are deliberately out of scope. */
export type ISODate = string;

export type Discipline = "strength" | "run" | "swim" | "cycle" | "other";

/** Heart-rate data for one session, used for TRIMP. */
export interface HeartRate {
  /** Average heart rate during the session (bpm). */
  average: number;
  /** Athlete's resting heart rate (bpm). */
  resting: number;
  /** Athlete's maximum heart rate (bpm). */
  max: number;
  /** Banister's sex-specific weighting constant: 1.92 (male) or 1.67 (female). */
  sex?: "male" | "female";
}

export interface Session {
  date: ISODate;
  discipline: Discipline;
  /** Duration in minutes. */
  durationMin: number;
  /** Session rating of perceived exertion on the CR-10 scale (0-10). */
  rpe?: number;
  heartRate?: HeartRate;
}

/** How a session's load was derived, so results stay explainable. */
export type LoadMethod = "trimp" | "srpe";

export interface SessionLoad {
  session: Session;
  /** Load in arbitrary units (AU), comparable across disciplines. */
  load: number;
  method: LoadMethod;
}

export interface DailyLoad {
  date: ISODate;
  load: number;
}
