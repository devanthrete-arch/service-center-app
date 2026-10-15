import { autoflex } from "./api";
export type Interval = { open: string; close: string };
export type Schedule = {
  week: { dayOfWeek: number; intervals: Interval[] }[];
  exceptions: { date: string; intervals: Interval[] }[];
  bookingEnabled: boolean;
  autoAccept: boolean;
  slotCapacity: number;
  leadMinutes: number;
  advanceDays: number;
};
export type Impact = {
  existingReservations: number;
  outsideHours: number;
  overCapacitySlots: number;
  conflictingGridBookings: number;
};
export type ScheduleView = Schedule & { revision: number; impact: Impact };
export type ScheduleAttempt = { body: Schedule; version: number; key: string };
const PREFIX = "af_sc_schedule_attempt:";
export const scheduleKey = (staff: string, center: string) =>
  `${PREFIX}${staff}:${center}`;
export function clearScheduleAttempts() {
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith(PREFIX))
    .forEach((key) => sessionStorage.removeItem(key));
}
export function readScheduleAttempt(key: string): ScheduleAttempt | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(key) ?? "null",
    ) as ScheduleAttempt | null;
    if (
      value &&
      Number.isSafeInteger(value.version) &&
      value.version > 0 &&
      typeof value.key === "string" &&
      /^[\w.:-]{8,128}$/.test(value.key) &&
      value.body &&
      Array.isArray(value.body.week) &&
      value.body.week.length === 7 &&
      value.body.week.every(
        (day) =>
          day &&
          Array.isArray(day.intervals) &&
          day.intervals.every(
            (i) =>
              i && typeof i.open === "string" && typeof i.close === "string",
          ),
      ) &&
      Array.isArray(value.body.exceptions) &&
      value.body.exceptions.every(
        (day) =>
          day && typeof day.date === "string" && Array.isArray(day.intervals),
      )
    )
      return value;
  } catch {
    /* A damaged stored attempt must not be replayed. */
  }
  sessionStorage.removeItem(key);
  return null;
}
export function scheduleBody(value: Schedule): Schedule {
  const {
    week,
    exceptions,
    bookingEnabled,
    autoAccept,
    slotCapacity,
    leadMinutes,
    advanceDays,
  } = value;
  return {
    week,
    exceptions,
    bookingEnabled,
    autoAccept,
    slotCapacity,
    leadMinutes,
    advanceDays,
  };
}
export const scheduleApi = {
  get: (signal?: AbortSignal) =>
    autoflex<ScheduleView>("/v1/center/booking-schedule", { signal }, true),
  preview: (body: Schedule, date: string) =>
    autoflex<{
      revision: number;
      impact: Impact;
      date: string;
      slots: { start: string; end: string }[];
    }>(
      `/v1/center/booking-schedule/preview?date=${encodeURIComponent(date)}`,
      {
        method: "POST",
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
      true,
    ),
  save: (attempt: ScheduleAttempt) =>
    autoflex<ScheduleView>(
      "/v1/center/booking-schedule",
      {
        method: "PUT",
        body: JSON.stringify(attempt.body),
        signal: AbortSignal.timeout(15000),
        headers: {
          "If-Match": String(attempt.version),
          "Idempotency-Key": attempt.key,
        },
      },
      true,
    ),
};
