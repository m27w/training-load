import { nelderMead } from "./optimize.js";
import type { DailyLoad, ISODate } from "./types.js";

// ---------------------------------------------------------------------------
// Exponentially weighted moving averages and the acute:chronic workload ratio
// ---------------------------------------------------------------------------

/**
 * Exponentially weighted moving average with decay lambda = 2 / (N + 1)
 * (Williams et al., 2017). Unlike a rolling average it weights recent days more
 * heavily, and it doesn't "drop" a big session off a cliff after N days.
 */
export function ewma(values: number[], days: number): number[] {
  if (days < 1) throw new RangeError("days must be >= 1");
  const lambda = 2 / (days + 1);
  const out: number[] = [];
  let previous = 0;
  for (const value of values) {
    previous = lambda * value + (1 - lambda) * previous;
    out.push(previous);
  }
  return out;
}

export type AcwrZone = "undertraining" | "optimal" | "caution" | "high-risk";

export interface AcwrPoint {
  date: ISODate;
  load: number;
  acute: number;
  chronic: number;
  /** null until the chronic window is filled, or when chronic load is zero. */
  ratio: number | null;
  zone: AcwrZone | null;
}

/**
 * Classify an acute:chronic ratio into the commonly cited bands
 * (Gabbett, 2016). These thresholds are a heuristic, and their predictive
 * value for injury is debated in the literature, so treat them as a prompt
 * to look closer, not a diagnosis.
 */
export function acwrZone(ratio: number): AcwrZone {
  if (ratio < 0.8) return "undertraining";
  if (ratio <= 1.3) return "optimal";
  if (ratio <= 1.5) return "caution";
  return "high-risk";
}

export function acuteChronic(daily: DailyLoad[], acuteDays = 7, chronicDays = 28): AcwrPoint[] {
  if (acuteDays >= chronicDays) throw new RangeError("acute window must be shorter than chronic window");
  const loads = daily.map((d) => d.load);
  const acute = ewma(loads, acuteDays);
  const chronic = ewma(loads, chronicDays);
  return daily.map((d, i) => {
    const c = chronic[i]!;
    const ratio = i + 1 >= chronicDays && c > 0 ? acute[i]! / c : null;
    return {
      date: d.date,
      load: d.load,
      acute: acute[i]!,
      chronic: c,
      ratio,
      zone: ratio === null ? null : acwrZone(ratio),
    };
  });
}

// ---------------------------------------------------------------------------
// Monotony and strain (Foster, 1998)
// ---------------------------------------------------------------------------

export interface WeeklyStress {
  endDate: ISODate;
  weeklyLoad: number;
  /** Mean daily load / SD of daily load. High = every day looks the same. */
  monotony: number | null;
  /** Weekly load x monotony. Spikes have been linked to illness and overreaching. */
  strain: number | null;
}

/** Rolling 7-day monotony and strain, one point per day once 7 days exist. */
export function monotonyAndStrain(daily: DailyLoad[]): WeeklyStress[] {
  const out: WeeklyStress[] = [];
  for (let end = 6; end < daily.length; end++) {
    const week = daily.slice(end - 6, end + 1).map((d) => d.load);
    const total = week.reduce((a, b) => a + b, 0);
    const mean = total / 7;
    const sd = Math.sqrt(week.reduce((a, b) => a + (b - mean) ** 2, 0) / 7);
    const monotony = sd > 0 ? mean / sd : null;
    out.push({
      endDate: daily[end]!.date,
      weeklyLoad: total,
      monotony,
      strain: monotony === null ? null : total * monotony,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Banister fitness-fatigue impulse-response model (Banister et al., 1975)
// ---------------------------------------------------------------------------

export interface BanisterParams {
  /** Baseline performance with no training. */
  p0: number;
  /** Gain on fitness. */
  k1: number;
  /** Gain on fatigue. */
  k2: number;
  /** Fitness decay time constant (days); typically ~40. */
  tau1: number;
  /** Fatigue decay time constant (days); typically ~10. */
  tau2: number;
}

export interface BanisterPoint {
  date: ISODate;
  fitness: number;
  fatigue: number;
  performance: number;
}

/**
 * performance(t) = p0 + k1 * fitness(t) - k2 * fatigue(t)
 *
 * where fitness and fatigue are the day's load plus the previous value decayed
 * by e^(-1/tau). Fatigue rises fast and fades fast; fitness rises slowly and
 * lasts. That asymmetry is why a taper (cutting load before a race) improves
 * performance.
 */
export function banister(daily: DailyLoad[], params: BanisterParams): BanisterPoint[] {
  const { p0, k1, k2, tau1, tau2 } = params;
  if (tau1 <= 0 || tau2 <= 0) throw new RangeError("time constants must be positive");
  const decayFitness = Math.exp(-1 / tau1);
  const decayFatigue = Math.exp(-1 / tau2);
  let fitness = 0;
  let fatigue = 0;
  return daily.map(({ date, load }) => {
    fitness = fitness * decayFitness + load;
    fatigue = fatigue * decayFatigue + load;
    return { date, fitness, fatigue, performance: p0 + k1 * fitness - k2 * fatigue };
  });
}

export interface PerformanceTest {
  date: ISODate;
  /** Any score where higher is better, e.g. a 5 km time converted to speed. */
  score: number;
}

export interface BanisterFit {
  params: BanisterParams;
  /** Root-mean-square error between modelled and observed scores. */
  rmse: number;
  converged: boolean;
}

/**
 * Fit the five Banister parameters to an athlete's performance tests by
 * minimising squared error with Nelder-Mead.
 *
 * Gains and time constants are optimised in log space, which keeps them
 * positive without constrained optimisation and makes steps proportional.
 * The fit is only as good as the data: five parameters need well over five
 * tests spread across varied training to be meaningful.
 */
export function fitBanister(
  daily: DailyLoad[],
  tests: PerformanceTest[],
  initial: BanisterParams = { p0: 0, k1: 0.1, k2: 0.2, tau1: 40, tau2: 10 },
): BanisterFit {
  if (tests.length < 6) throw new RangeError("need at least 6 performance tests to fit 5 parameters");
  const index = new Map(daily.map((d, i) => [d.date, i]));
  const testIdx = tests.map((t) => {
    const i = index.get(t.date);
    if (i === undefined) throw new RangeError(`test date ${t.date} is outside the load series`);
    return i;
  });

  const p0Guess = initial.p0 || tests.reduce((a, t) => a + t.score, 0) / tests.length;
  const toVector = (p: BanisterParams) => [p.p0, Math.log(p.k1), Math.log(p.k2), Math.log(p.tau1), Math.log(p.tau2)];
  const fromVector = (v: number[]): BanisterParams => ({
    p0: v[0]!, k1: Math.exp(v[1]!), k2: Math.exp(v[2]!), tau1: Math.exp(v[3]!), tau2: Math.exp(v[4]!),
  });

  const sse = (v: number[]) => {
    const p = fromVector(v);
    // Keep the fatigue time constant shorter than fitness, as the model intends.
    if (p.tau2 >= p.tau1 || p.tau1 > 365) return Number.MAX_VALUE;
    const modelled = banister(daily, p);
    return tests.reduce((acc, t, j) => acc + (modelled[testIdx[j]!]!.performance - t.score) ** 2, 0);
  };

  // Restart from the best point a few times: cheap insurance against early stalls.
  let best = nelderMead(sse, toVector({ ...initial, p0: p0Guess }), { step: [1, 0.5, 0.5, 0.3, 0.3] });
  for (let restart = 0; restart < 4; restart++) {
    const next = nelderMead(sse, best.x, { step: [0.5, 0.25, 0.25, 0.15, 0.15] });
    if (next.value >= best.value - 1e-12) break;
    best = next;
  }

  return {
    params: fromVector(best.x),
    rmse: Math.sqrt(best.value / tests.length),
    converged: best.converged,
  };
}
