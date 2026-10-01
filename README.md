# training-load

A TypeScript library for modelling training load across disciplines (gym, running, swimming and cycling) using established sports-science models. Fully typed, dependency-free at runtime, and tested.

This is the analytics engine behind the ideas in [Strand](https://mystrand.app), my fitness app for hybrid athletes. The hard problem for someone who lifts, runs and swims is that there's no shared unit: a 5 km run and a heavy squat session can't be compared directly. This library puts them on one scale and then models what that load does to the body over time.

```
$ npm run demo

week  weekly load  peak ACWR  zone           monotony  strain
   4         1742       0.99  optimal            1.39    2425
   5         1772       1.26  optimal            1.40    2486
   ...
   8         1867       1.16  optimal            1.42    2656
   9         4178       1.60  high-risk          1.43    5964   <- load spike flagged
  10         1929       1.19  optimal            1.43    2761
  12         1001       0.77  undertraining      1.43    1433   <- taper week
```

## What's inside

### 1. One unit for every discipline

| Method | Formula | Used for |
|---|---|---|
| **Session-RPE** (Foster, 2001) | RPE (0–10) × minutes | Any session, especially strength, where heart rate under-reads effort |
| **TRIMP** (Banister) | minutes × HRr × 0.64 × e^(b·HRr) | Endurance sessions with heart-rate data. The exponential term weights hard efforts more than easy ones. |

The two scales don't match out of the box, so `calibrateTrimp` fits a **per-athlete least-squares scale factor** (through the origin) from sessions that recorded both RPE and heart rate:

```
k = Σ(sRPE_i · TRIMP_i) / Σ(TRIMP_i²)
```

After calibration, a heart-rate-tracked run and an RPE-rated gym session are in the same arbitrary units. A session that can't be scored throws an error rather than silently counting as zero, because a missing session would quietly corrupt every model downstream.

### 2. Acute:chronic workload ratio (EWMA)

Short-term (7-day) and long-term (28-day) load are tracked with **exponentially weighted moving averages**, λ = 2/(N+1) (Williams et al., 2017), rather than rolling sums, so a big session decays gradually instead of dropping off a cliff after N days. The ratio is classified into the commonly cited bands. The code documents that their injury-predictive value is debated, so they're treated as a prompt, not a diagnosis.

### 3. Monotony and strain (Foster, 1998)

Monotony is mean ÷ SD of daily load over 7 days: when every day looks the same, monotony is high. Strain is weekly load × monotony. Zero-variance weeks return `null` instead of dividing by zero.

### 4. Banister fitness-fatigue model, fitted to the athlete

```
performance(t) = p0 + k1·fitness(t) − k2·fatigue(t)
fitness(t)     = fitness(t−1)·e^(−1/τ1) + load(t)
fatigue(t)     = fatigue(t−1)·e^(−1/τ2) + load(t)
```

Fatigue builds and fades quickly while fitness builds and fades slowly, which is why a taper improves performance. `fitBanister` fits all five parameters to an athlete's performance tests with a **Nelder-Mead simplex optimiser written from scratch** (`optimize.ts`):

- gains and time constants are optimised in **log space**, so they stay positive without constrained optimisation;
- invalid regions (τ2 ≥ τ1) are rejected;
- the optimiser restarts from its best point to escape early stalls;
- it refuses to fit with fewer than six tests, since five free parameters on five points is just interpolation.

## Usage

```ts
import { acuteChronic, dailyLoads, fitBanister, sessionLoads } from "training-load";

const loads = sessionLoads([
  { date: "2026-03-02", discipline: "strength", durationMin: 60, rpe: 8 },
  { date: "2026-03-03", discipline: "run", durationMin: 45, rpe: 6,
    heartRate: { average: 152, resting: 52, max: 192 } },
  // ...
]);

const daily = dailyLoads(loads);          // continuous series, rest days = 0
const today = acuteChronic(daily).at(-1); // { acute, chronic, ratio, zone }
```

## Engineering notes

- `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are all enabled.
- Dates are handled as UTC day numbers, so daylight-saving changes can't shift a session to the wrong day, and impossible dates like `2026-02-30` are rejected rather than rolled over.
- Tests use a seeded PRNG, so the stochastic tests are reproducible.

## Testing

```bash
npm install
npm test          # vitest: 19 tests
npm run typecheck
npm run demo
```

The test suite includes:

- the **Banister fit recovering a known ground-truth model** from noisy synthetic tests, checked across the whole curve and not just the test days;
- Nelder-Mead **minimising the Rosenbrock function** to within 10⁻³;
- a taper scenario showing higher modelled performance than continued heavy training;
- spike detection, warm-up handling and band classification for the ACWR;
- exact checks of TRIMP, monotony and strain against their formulae, plus the least-squares calibration.

## References

- Banister, E. W. et al. (1975). *A systems model of training for athletic performance.*
- Foster, C. (1998). *Monitoring training in athletes with reference to overtraining syndrome.*
- Foster, C. et al. (2001). *A new approach to monitoring exercise training.*
- Gabbett, T. J. (2016). *The training–injury prevention paradox.*
- Williams, S. et al. (2017). *Better way to determine the acute:chronic workload ratio?*

## Licence

MIT
