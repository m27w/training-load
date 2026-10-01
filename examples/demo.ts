/**
 * Twelve weeks of hybrid training: gym, running and swimming, with a reckless
 * load spike in week 9 and a taper in week 12. Run with: npm run demo
 */
import { acuteChronic, addDays, dailyLoads, monotonyAndStrain, sessionLoads } from "../src/index.js";
import type { Session } from "../src/index.js";

const hr = { resting: 52, max: 192 };
const sessions: Session[] = [];
const start = "2026-01-05"; // a Monday

for (let week = 0; week < 12; week++) {
  const spike = week === 8 ? 2.2 : 1;
  const taper = week === 11 ? 0.5 : 1;
  const progression = (1 + week * 0.04) * spike * taper;
  const day = (d: number) => addDays(start, week * 7 + d);

  sessions.push(
    { date: day(0), discipline: "strength", durationMin: Math.round(60 * spike * taper), rpe: 7 },
    { date: day(1), discipline: "run", durationMin: Math.round(40 * progression), rpe: 6, heartRate: { ...hr, average: 152 } },
    { date: day(2), discipline: "swim", durationMin: Math.round(35 * progression), rpe: 5, heartRate: { ...hr, average: 138 } },
    { date: day(3), discipline: "strength", durationMin: Math.round(55 * spike * taper), rpe: 8 },
    { date: day(5), discipline: "run", durationMin: Math.round(75 * progression), rpe: 5, heartRate: { ...hr, average: 141 } },
  );
}

const daily = dailyLoads(sessionLoads(sessions), { start, end: addDays(start, 12 * 7 - 1) });
const acwr = acuteChronic(daily);
const stress = monotonyAndStrain(daily);

console.log("week  weekly load  peak ACWR  zone           monotony  strain");
for (let i = 6; i < daily.length; i += 7) {
  const s = stress[i - 6]!;
  // Report the week's highest daily ratio: the spike is what matters, not Sunday's value.
  const week = acwr.slice(i - 6, i + 1).filter((p) => p.ratio !== null);
  const a = week.reduce((m, p) => (p.ratio! > (m?.ratio ?? -1) ? p : m), week[0]) ?? acwr[i]!;
  const ratio = a.ratio === null ? "     -   " : a.ratio.toFixed(2).padStart(9);
  console.log(
    `${String((i + 1) / 7).padStart(4)}  ${s.weeklyLoad.toFixed(0).padStart(11)}  ${ratio}  ${(a.zone ?? "warming up").padEnd(13)}  ` +
      `${s.monotony?.toFixed(2) ?? "-"}`.padStart(8) + `  ${s.strain?.toFixed(0) ?? "-"}`.padStart(8),
  );
}
