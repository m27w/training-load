import { describe, expect, it } from "vitest";
import { addDays, calibrateTrimp, dailyLoads, dateRange, sessionLoads, sessionRpeLoad, toDayNumber, trimp } from "../src/index.js";
import type { Session } from "../src/index.js";

const hr = { average: 150, resting: 50, max: 190 };

describe("dates", () => {
  it("handles month and leap-year boundaries", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dateRange("2026-03-28", "2026-04-01")).toHaveLength(5);
  });

  it("rejects impossible dates instead of rolling them over", () => {
    expect(() => toDayNumber("2026-02-30")).toThrow(RangeError);
    expect(() => toDayNumber("26-1-1")).toThrow(RangeError);
  });
});

describe("session load", () => {
  it("computes session-RPE", () => {
    expect(sessionRpeLoad(7, 60)).toBe(420);
    expect(() => sessionRpeLoad(11, 60)).toThrow(RangeError);
  });

  it("computes Banister TRIMP and weights intensity exponentially", () => {
    const fraction = (150 - 50) / (190 - 50);
    expect(trimp(60, hr)).toBeCloseTo(60 * fraction * 0.64 * Math.exp(1.92 * fraction), 10);
    const easy = trimp(60, { ...hr, average: 110 });
    const hard = trimp(60, { ...hr, average: 170 });
    // Doubling time at an easy pace is worth less than a much harder hour.
    expect(hard).toBeGreaterThan(2 * easy);
    expect(trimp(60, { ...hr, sex: "female" })).toBeLessThan(trimp(60, hr));
  });

  it("calibrates TRIMP onto the session-RPE scale by least squares", () => {
    const sessions: Session[] = [40, 60, 80].map((min, i) => ({
      date: `2026-01-0${i + 1}`, discipline: "run", durationMin: min, rpe: 6, heartRate: hr,
    }));
    const k = calibrateTrimp(sessions)!;
    // Every session has the same RPE and HR, so srpe / trimp is constant and k equals it exactly.
    expect(k).toBeCloseTo(sessionRpeLoad(6, 60) / trimp(60, hr), 10);
    expect(calibrateTrimp(sessions.slice(0, 2))).toBeNull();
  });

  it("uses TRIMP for endurance and sRPE for strength once calibrated", () => {
    const sessions: Session[] = [
      { date: "2026-01-01", discipline: "run", durationMin: 50, rpe: 6, heartRate: hr },
      { date: "2026-01-02", discipline: "swim", durationMin: 40, rpe: 5, heartRate: hr },
      { date: "2026-01-03", discipline: "cycle", durationMin: 90, rpe: 4, heartRate: hr },
      { date: "2026-01-04", discipline: "strength", durationMin: 60, rpe: 8, heartRate: hr },
      { date: "2026-01-05", discipline: "run", durationMin: 30, heartRate: hr },
    ];
    const methods = sessionLoads(sessions).map((l) => l.method);
    expect(methods).toEqual(["trimp", "trimp", "trimp", "srpe", "trimp"]);
  });

  it("refuses to silently drop a session it cannot score", () => {
    expect(() => sessionLoads([{ date: "2026-01-01", discipline: "run", durationMin: 30 }])).toThrow();
  });

  it("aggregates per day and fills rest days with zero", () => {
    const loads = sessionLoads([
      { date: "2026-01-01", discipline: "strength", durationMin: 60, rpe: 7 },
      { date: "2026-01-01", discipline: "other", durationMin: 20, rpe: 3 },
      { date: "2026-01-04", discipline: "strength", durationMin: 45, rpe: 8 },
    ]);
    expect(dailyLoads(loads)).toEqual([
      { date: "2026-01-01", load: 480 },
      { date: "2026-01-02", load: 0 },
      { date: "2026-01-03", load: 0 },
      { date: "2026-01-04", load: 360 },
    ]);
  });
});
