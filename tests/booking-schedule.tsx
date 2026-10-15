import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ScheduleEditor } from "../src/screens/BookingSchedule";
import {
  scheduleApi,
  scheduleBody,
  scheduleKey,
  readScheduleAttempt,
  type ScheduleView,
  type ScheduleAttempt,
} from "../src/lib/booking-schedule";
import { ApiError } from "../src/lib/api";
import { signOut } from "../src/lib/session";
import "../src/styles.css";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const fixture = document.getElementById("fixture")!;
const root = createRoot(fixture);
const results = document.getElementById("results")!;
const originals = { ...scheduleApi };
const oldSession = Object.entries(sessionStorage);
const oldToken = localStorage.getItem("af_sc_access_token");
const key = scheduleKey("test-staff", "test-center");
const view: ScheduleView = {
  revision: 1,
  week: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    intervals: [{ open: "09:00", close: "17:00" }],
  })),
  exceptions: [],
  bookingEnabled: true,
  autoAccept: true,
  slotCapacity: 1,
  leadMinutes: 0,
  advanceDays: 7,
  impact: {
    existingReservations: 0,
    outsideHours: 0,
    overCapacitySlots: 0,
    conflictingGridBookings: 0,
  },
};
function check(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
  const li = document.createElement("li");
  li.textContent = `PASS ${message}`;
  results.append(li);
}
const button = (text: string) =>
  [...fixture.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )!;
const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
  });
};
const mount = async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <MemoryRouter>
          <ScheduleEditor staffId="test-staff" centerId="test-center" />
        </MemoryRouter>
      </StrictMode>,
    ),
  );
};
async function run() {
  sessionStorage.removeItem(key);
  scheduleApi.get = async () => structuredClone(view);
  scheduleApi.preview = async () => ({
    revision: 1,
    date: "2026-10-14",
    slots: [],
    impact: { ...view.impact, outsideHours: 2 },
  });
  let requests: ScheduleAttempt[] = [];
  scheduleApi.save = async (attempt) => {
    requests.push(structuredClone(attempt));
    throw new ApiError(0, "Connection lost");
  };
  await mount();
  check(
    fixture.querySelectorAll('input[type="time"]').length === 14,
    "shows all seven working days",
  );
  const windowInput = [...fixture.querySelectorAll('input[type="number"]')].at(
    -1,
  ) as HTMLInputElement;
  check(windowInput.value === "7", "shows the seven-day booking default");
  await click(button("Remove"));
  check(
    fixture.textContent?.includes("Closed") && button("Save schedule").disabled,
    "closing a weekday invalidates the previous impact check",
  );
  await click(button("Check impact"));
  check(
    fixture.textContent?.includes("2 outside"),
    "shows bookings affected by a closure",
  );
  await act(async () => {
    fixture
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  check(
    !!readScheduleAttempt(key) && !!button("Check update result"),
    "retains an ambiguous save with a recovery action",
  );
  scheduleApi.save = async (attempt) => {
    requests.push(structuredClone(attempt));
    return { ...view, revision: 2 };
  };
  await click(button("Check update result"));
  check(
    requests.length === 2 &&
      JSON.stringify(requests[0]) === JSON.stringify(requests[1]),
    "retries the exact body, revision and idempotency key",
  );
  check(readScheduleAttempt(key) === null, "clears the successful attempt");
  await act(async () => root.render(null));
  sessionStorage.setItem(key, "{bad");
  check(readScheduleAttempt(key) === null, "ignores malformed browser storage");
  sessionStorage.setItem(
    key,
    JSON.stringify({
      key: "pending-test",
      version: 1,
      body: scheduleBody(view),
    }),
  );
  scheduleApi.get = async () => {
    throw new ApiError(403, "Access denied");
  };
  await mount();
  check(
    fixture.textContent?.includes("Access denied") &&
      !fixture.querySelector("form") &&
      !readScheduleAttempt(key),
    "denied reads remove editing controls and pending attempts",
  );
  sessionStorage.setItem(
    key,
    JSON.stringify({
      key: "pending-test",
      version: 1,
      body: scheduleBody(view),
    }),
  );
  signOut();
  check(!sessionStorage.getItem(key), "sign-out clears schedule attempts");
}
void run()
  .then(() => {
    document.getElementById("status")!.textContent =
      `${results.children.length} passed`;
  })
  .catch((error: unknown) => {
    document.getElementById("status")!.textContent = `FAIL ${String(error)}`;
    console.error(error);
  })
  .finally(() => {
    Object.assign(scheduleApi, originals);
    sessionStorage.clear();
    for (const [k, v] of oldSession) sessionStorage.setItem(k, v);
    if (oldToken) localStorage.setItem("af_sc_access_token", oldToken);
    else localStorage.removeItem("af_sc_access_token");
  });
