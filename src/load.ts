import { dateRange, toDayNumber } from "./dates.js";
import type { DailyLoad, ISODate, Session, SessionLoad } from "./types.js";

/**
 * Session-RPE load (Foster et al., 2001): RPE (CR-10) x duration in minutes.
 * Works for any discipline, which is why it is the common currency here.
 */
export function sessionRpeLoad(rpe: number, durationMin: number): number {
  if (rpe < 0 || rpe > 10) throw new RangeError("RPE must be on the 0-10 CR-10 scale");
  if (durationMin < 0) throw new RangeError("duration must be non-negative");
  return rpe * durationMin;
}

/**
 * Banister's training impulse (TRIMP): duration x HRr x 0.64 x e^(b x HRr),
 * where HRr is the fraction of heart-rate reserve used. The exponential
 * weighting reflects blood lactate rising non-linearly with intensity.
 */
export function trimp(durationMin: number, hr: NonNullable<Session["heartRate"]>): number {
  const reserve = hr.max - hr.resting;
  if (reserve <= 0) throw new RangeError("max HR must exceed resting HR");
  const fraction = Math.min(Math.max((hr.average - hr.resting) / reserve, 0), 1);
  const b = hr.sex === "female" ? 1.67 : 1.92;
  return durationMin * fraction * 0.64 * Math.exp(b * fraction);
}

/** Disciplines where heart rate tracks effort well enough to trust TRIMP. */
const HR_RELIABLE = new Set<Session["discipline"]>(["run", "cycle", "swim"]);

/**
 * Least-squares scale factor k (through the origin) mapping TRIMP onto
 * session-RPE units, fitted from sessions that recorded both:
 *
 *     k = sum(srpe_i x trimp_i) / sum(trimp_i^2)
 *
 * This puts heart-rate-based endurance load and RPE-based gym load on one
 * comparable scale for this specific athlete. Returns null with too few pairs.
 */
export function calibrateTrimp(sessions: Session[], minPairs = 3): number | null {
  let numerator = 0;
  let denominator = 0;
  let pairs = 0;
  for (const s of sessions) {
    if (s.rpe === undefined || !s.heartRate || !HR_RELIABLE.has(s.discipline)) continue;
    const t = trimp(s.durationMin, s.heartRate);
    if (t === 0) continue;
    numerator += sessionRpeLoad(s.rpe, s.durationMin) * t;
    denominator += t * t;
    pairs += 1;
  }
  return pairs >= minPairs && denominator > 0 ? numerator / denominator : null;
}

/**
 * Convert every session into a comparable load in arbitrary units (AU).
 *
 * Endurance sessions with heart-rate data use calibrated TRIMP; everything else
 * (including all strength work, where HR under-reads effort) uses session-RPE.
 * A session with neither RPE nor usable heart-rate data is an error rather than
 * a silent zero, because a missing session would distort every model downstream.
 */
export function sessionLoads(sessions: Session[]): SessionLoad[] {
  const k = calibrateTrimp(sessions);
  return sessions.map((session) => {
    if (k !== null && session.heartRate && HR_RELIABLE.has(session.discipline)) {
      return { session, load: k * trimp(session.durationMin, session.heartRate), method: "trimp" };
    }
    if (session.rpe !== undefined) {
      return { session, load: sessionRpeLoad(session.rpe, session.durationMin), method: "srpe" };
    }
    throw new Error(`Session on ${session.date} has no RPE and no calibrated heart-rate data`);
  });
}

/**
 * Sum session loads per day and fill rest days with zero, so time-series
 * models see a continuous daily series.
 */
export function dailyLoads(loads: SessionLoad[], range?: { start: ISODate; end: ISODate }): DailyLoad[] {
  if (loads.length === 0 && !range) return [];
  const totals = new Map<ISODate, number>();
  for (const { session, load } of loads) {
    toDayNumber(session.date); // validates the date
    totals.set(session.date, (totals.get(session.date) ?? 0) + load);
  }
  const dates = [...totals.keys()].sort();
  const start = range?.start ?? dates[0]!;
  const end = range?.end ?? dates[dates.length - 1]!;
  return dateRange(start, end).map((date) => ({ date, load: totals.get(date) ?? 0 }));
}
