import { describe, expect, it } from "vitest";
import {
  acuteChronic, acwrZone, addDays, banister, ewma, fitBanister, monotonyAndStrain, nelderMead,
} from "../src/index.js";
import type { BanisterParams, DailyLoad } from "../src/index.js";

const series = (loads: number[], start = "2026-01-01"): DailyLoad[] =>
  loads.map((load, i) => ({ date: addDays(start, i), load }));

/** Deterministic pseudo-random generator (mulberry32) so tests are reproducible. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("ewma", () => {
  it("applies lambda = 2 / (N + 1)", () => {
    expect(ewma([10, 10], 3)).toEqual([5, 7.5]);
  });

  it("converges to a constant input", () => {
    const out = ewma(new Array(400).fill(100), 28);
    expect(out[out.length - 1]).toBeCloseTo(100, 6);
  });
});

describe("acute:chronic workload ratio", () => {
  it("is undefined until the chronic window is filled", () => {
    const points = acuteChronic(series(new Array(30).fill(300)));
    expect(points.slice(0, 27).every((p) => p.ratio === null)).toBe(true);
    expect(points[27]!.ratio).not.toBeNull();
  });

  it("flags a sudden spike after steady training", () => {
    const loads = [...new Array(60).fill(300), ...new Array(7).fill(900)];
    const last = acuteChronic(series(loads)).at(-1)!;
    expect(last.ratio!).toBeGreaterThan(1.5);
    expect(last.zone).toBe("high-risk");
  });

  it("classifies the commonly cited bands", () => {
    expect([0.5, 1.0, 1.4, 1.8].map(acwrZone)).toEqual(["undertraining", "optimal", "caution", "high-risk"]);
  });
});

describe("monotony and strain", () => {
  it("is null when every day is identical (zero variance)", () => {
    expect(monotonyAndStrain(series(new Array(7).fill(100)))[0]!.monotony).toBeNull();
  });

  it("matches Foster's definition", () => {
    const week = [0, 300, 400, 0, 500, 300, 600];
    const mean = 2100 / 7;
    const sd = Math.sqrt(week.reduce((a, x) => a + (x - mean) ** 2, 0) / 7);
    const [point] = monotonyAndStrain(series(week));
    expect(point!.monotony).toBeCloseTo(mean / sd, 10);
    expect(point!.strain).toBeCloseTo(2100 * (mean / sd), 8);
  });
});

describe("Banister model", () => {
  const truth: BanisterParams = { p0: 50, k1: 0.08, k2: 0.24, tau1: 42, tau2: 8 };

  it("shows that a taper raises performance", () => {
    const training = new Array(70).fill(400);
    const taper = [...training, ...new Array(10).fill(100)];
    const keepGoing = [...training, ...new Array(10).fill(400)];
    const afterTaper = banister(series(taper), truth).at(-1)!.performance;
    const noTaper = banister(series(keepGoing), truth).at(-1)!.performance;
    expect(afterTaper).toBeGreaterThan(noTaper);
  });

  it("recovers the true response from noisy performance tests", () => {
    const random = rng(1);
    const loads = Array.from({ length: 240 }, (_, i) => {
      const block = Math.floor(i / 21) % 3;                 // build, build, recover
      const base = block === 2 ? 150 : 350 + 50 * block;
      return random() < 0.15 ? 0 : base * (0.7 + 0.6 * random());
    });
    const daily = series(loads);
    const truthCurve = banister(daily, truth);
    const tests = truthCurve
      .filter((_, i) => i > 20 && i % 9 === 0)
      .map((p) => ({ date: p.date, score: p.performance + (random() - 0.5) * 1.0 }));

    const fit = fitBanister(daily, tests);
    expect(fit.rmse).toBeLessThan(0.6);                     // noise SD is ~0.29
    expect(fit.params.tau2).toBeLessThan(fit.params.tau1);
    // The fitted curve should track the true curve across the whole period, not only on test days.
    const fitted = banister(daily, fit.params);
    const maxError = Math.max(...fitted.slice(30).map((p, i) => Math.abs(p.performance - truthCurve[i + 30]!.performance)));
    expect(maxError).toBeLessThan(3);
  });

  it("requires enough tests to fit five parameters", () => {
    expect(() => fitBanister(series([100, 100]), [])).toThrow(RangeError);
  });
});

describe("nelderMead", () => {
  it("minimises the Rosenbrock function", () => {
    const rosenbrock = ([x, y]: number[]) => (1 - x!) ** 2 + 100 * (y! - x! ** 2) ** 2;
    const result = nelderMead(rosenbrock, [-1.2, 1], { maxIterations: 5000, tolerance: 1e-14 });
    expect(result.converged).toBe(true);
    expect(result.x[0]).toBeCloseTo(1, 3);
    expect(result.x[1]).toBeCloseTo(1, 3);
  });
});
