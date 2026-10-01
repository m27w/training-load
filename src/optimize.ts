/**
 * Nelder-Mead downhill simplex minimiser.
 *
 * A derivative-free optimiser: it keeps n+1 points (a simplex) in n
 * dimensions and repeatedly reflects, expands, contracts or shrinks it toward
 * lower values. It suits small, noisy, non-differentiable objectives like
 * fitting the Banister model to a handful of performance tests.
 */

export interface MinimizeOptions {
  /** Initial step along each axis when building the starting simplex. */
  step?: number | number[];
  maxIterations?: number;
  /** Stop when the spread of function values across the simplex falls below this. */
  tolerance?: number;
}

export interface MinimizeResult {
  x: number[];
  value: number;
  iterations: number;
  converged: boolean;
}

export function nelderMead(
  f: (x: number[]) => number,
  start: number[],
  { step = 0.5, maxIterations = 2_000, tolerance = 1e-10 }: MinimizeOptions = {},
): MinimizeResult {
  const n = start.length;
  const steps = Array.isArray(step) ? step : start.map(() => step);
  // Standard coefficients: reflection, expansion, contraction, shrink.
  const [alpha, gamma, rho, sigma] = [1, 2, 0.5, 0.5];

  let simplex: { x: number[]; v: number }[] = [{ x: [...start], v: f(start) }];
  for (let i = 0; i < n; i++) {
    const x = [...start];
    x[i] = x[i]! + steps[i]!;
    simplex.push({ x, v: f(x) });
  }

  const combine = (a: number[], b: number[], t: number) => a.map((ai, i) => ai + t * (b[i]! - ai));

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    simplex.sort((p, q) => p.v - q.v);
    const best = simplex[0]!;
    const worst = simplex[n]!;
    const secondWorst = simplex[n - 1]!;

    if (Math.abs(worst.v - best.v) < tolerance) {
      return { x: best.x, value: best.v, iterations: iteration, converged: true };
    }

    // Centroid of every point except the worst.
    const centroid = new Array<number>(n).fill(0);
    for (const p of simplex.slice(0, n)) p.x.forEach((xi, i) => (centroid[i]! += xi / n));

    const reflected = combine(centroid, worst.x, -alpha);
    const vr = f(reflected);

    if (vr < best.v) {
      const expanded = combine(centroid, worst.x, -gamma);
      const ve = f(expanded);
      simplex[n] = ve < vr ? { x: expanded, v: ve } : { x: reflected, v: vr };
      continue;
    }
    if (vr < secondWorst.v) {
      simplex[n] = { x: reflected, v: vr };
      continue;
    }

    const outside = vr < worst.v;
    const contracted = outside ? combine(centroid, reflected, rho) : combine(centroid, worst.x, rho);
    const vc = f(contracted);
    if (vc < (outside ? vr : worst.v)) {
      simplex[n] = { x: contracted, v: vc };
      continue;
    }

    // Shrink everything toward the best point.
    simplex = simplex.map((p, i) => {
      if (i === 0) return p;
      const x = combine(best.x, p.x, sigma);
      return { x, v: f(x) };
    });
  }

  simplex.sort((p, q) => p.v - q.v);
  return { x: simplex[0]!.x, value: simplex[0]!.v, iterations: maxIterations, converged: false };
}
