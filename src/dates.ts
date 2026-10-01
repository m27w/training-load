import type { ISODate } from "./types.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** Days since the Unix epoch, computed in UTC so DST changes can't shift a day. */
export function toDayNumber(date: ISODate): number {
  if (!ISO.test(date)) throw new RangeError(`Invalid ISO date: ${date}`);
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new RangeError(`Invalid ISO date: ${date}`);
  const day = ms / MS_PER_DAY;
  // Reject impossible dates like 2026-02-30, which Date.parse silently rolls over.
  if (fromDayNumber(day) !== date) throw new RangeError(`Invalid ISO date: ${date}`);
  return day;
}

export function fromDayNumber(day: number): ISODate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Every date from start to end inclusive. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const from = toDayNumber(start);
  const to = toDayNumber(end);
  if (to < from) throw new RangeError("end is before start");
  return Array.from({ length: to - from + 1 }, (_, i) => fromDayNumber(from + i));
}
