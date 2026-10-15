import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../domain/store";
import { ApiError, errorMessage } from "../lib/api";
import {
  readScheduleAttempt,
  scheduleApi,
  scheduleBody,
  scheduleKey,
  type Impact,
  type Interval,
  type Schedule,
  type ScheduleAttempt,
} from "../lib/booking-schedule";
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function Intervals({
  value,
  change,
  label,
}: {
  value: Interval[];
  change: (value: Interval[]) => void;
  label: string;
}) {
  return (
    <div className="schedule-intervals">
      {!value.length && <span>Closed</span>}
      {value.map((interval, index) => (
        <div key={index} className="schedule-interval">
          <input
            aria-label={`${label} opening ${index + 1}`}
            type="time"
            required
            value={interval.open}
            onChange={(event) =>
              change(
                value.map((item, i) =>
                  i === index ? { ...item, open: event.target.value } : item,
                ),
              )
            }
          />
          <span>to</span>
          <input
            aria-label={`${label} closing ${index + 1}`}
            type="time"
            required
            value={interval.close}
            onChange={(event) =>
              change(
                value.map((item, i) =>
                  i === index ? { ...item, close: event.target.value } : item,
                ),
              )
            }
          />
          <button
            type="button"
            aria-label={`Remove ${label} interval ${index + 1}`}
            onClick={() => change(value.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={value.length >= 8}
        onClick={() =>
          change([
            ...value,
            { open: value.at(-1)?.close ?? "09:00", close: "17:00" },
          ])
        }
      >
        Add working interval
      </button>
    </div>
  );
}
function ImpactNotice({ value }: { value: Impact }) {
  return (
    <p role="status">
      {value.existingReservations} existing arrivals retained.{" "}
      {value.outsideHours} outside the proposed working hours;{" "}
      {value.overCapacitySlots} slots above the new capacity.{" "}
      {value.conflictingGridBookings > 0 &&
        `${value.conflictingGridBookings} arrivals conflict with the new slot start times. These hours cannot be saved.`}{" "}
      Contact affected customers through the booking queue.
    </p>
  );
}
export function BookingSchedule() {
  const { me, role } = useStore();
  if (
    !["admin", "manager"].includes(role) ||
    !me.permissions.includes("center:manage")
  )
    return (
      <section className="panel">
        <h2>Working hours & booking slots</h2>
        <p>
          A center manager with scheduling access can change these settings.
        </p>
      </section>
    );
  return (
    <ScheduleEditor
      key={`${me.staff.id}:${me.center.id}`}
      staffId={me.staff.id}
      centerId={me.center.id}
    />
  );
}
export function ScheduleEditor({
  staffId,
  centerId,
}: {
  staffId: string;
  centerId: string;
}) {
  const storageKey = scheduleKey(staffId, centerId);
  const [attempt, setAttempt] = useState(() => readScheduleAttempt(storageKey));
  const [draft, setDraft] = useState<Schedule | null>(null);
  const [revision, setRevision] = useState(0);
  const [previewDate, setPreviewDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const [previewSlots, setPreviewSlots] = useState<
    { start: string; end: string }[] | null
  >(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [denied, setDenied] = useState(false);
  const [reload, setReload] = useState(0);
  const alive = useRef(true);
  const loading = useRef(false);
  const sending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    loading.current = true;
    setBusy(true);
    setError("");
    const timer = window.setTimeout(() => controller.abort(), 15000);
    scheduleApi
      .get(controller.signal)
      .then((value) => {
        if (!current || controller.signal.aborted) return;
        setDraft(scheduleBody(value));
        setPreviewSlots(null);
        setRevision(value.revision);
        setImpact(value.impact);
      })
      .catch((err: unknown) => {
        if (!current) return;
        setError(
          errorMessage(err, "Could not load the schedule. Retry to load it."),
        );
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setDenied(true);
          sessionStorage.removeItem(storageKey);
          setAttempt(null);
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (current) {
          loading.current = false;
          setBusy(false);
        }
      });
    return () => {
      current = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [reload, storageKey]);
  function edit(next: Schedule) {
    setDraft(next);
    setImpact(null);
    setPreviewSlots(null);
    setMessage("");
  }
  async function save(pending: ScheduleAttempt) {
    if (loading.current || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Persist before sending so timeout/reload retries use exactly the same command.
      sessionStorage.setItem(storageKey, JSON.stringify(pending));
      setAttempt(pending);
      await scheduleApi.save(pending);
      sessionStorage.removeItem(storageKey);
      if (!alive.current) return;
      setAttempt(null);
      setMessage("Schedule saved. Existing bookings have been preserved.");
      setReload((n) => n + 1);
    } catch (err) {
      if (!alive.current) return;
      setError(
        errorMessage(
          err,
          "The result is unknown. Check the saved attempt before making another change.",
        ),
      );
      if (
        err instanceof ApiError &&
        err.status >= 400 &&
        err.status < 500 &&
        err.status !== 408 &&
        err.status !== 429
      ) {
        sessionStorage.removeItem(storageKey);
        setAttempt(null);
        if ([401, 403, 404].includes(err.status)) setDenied(true);
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="panel booking-schedule">
      <h2>Working hours & booking slots</h2>
      <p>
        All times are in India Standard Time. Slots are 60-minute arrival
        windows; they do not promise when servicing will finish.
      </p>
      <Link to="/bookings">View booking queue</Link>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!denied && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              !draft ||
              window.confirm(
                "Reload the saved schedule? Unsaved edits will be discarded.",
              )
            )
              setReload((n) => n + 1);
          }}
        >
          Reload saved schedule
        </button>
      )}
      {attempt && !denied && (
        <aside>
          <p>
            A schedule update has an unresolved result. Check it using the same
            request before editing again.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(attempt)}
          >
            Check update result
          </button>
        </aside>
      )}
      {draft && !denied && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && !attempt && impact && !impact.conflictingGridBookings)
              void save({
                body: scheduleBody(draft),
                version: revision,
                key: crypto.randomUUID(),
              });
          }}
        >
          <fieldset disabled={busy || !!attempt}>
            <legend>Booking rules</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.bookingEnabled}
                onChange={(event) =>
                  edit({ ...draft, bookingEnabled: event.target.checked })
                }
              />
              Accept new bookings
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.autoAccept}
                onChange={(event) =>
                  edit({ ...draft, autoAccept: event.target.checked })
                }
              />
              Automatically confirm new bookings
            </label>
            <label>
              Arrivals per slot
              <input
                type="number"
                min="1"
                max="50"
                required
                value={draft.slotCapacity}
                onChange={(event) =>
                  edit({ ...draft, slotCapacity: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Advance notice (minutes)
              <input
                type="number"
                min="0"
                max="10080"
                required
                value={draft.leadMinutes}
                onChange={(event) =>
                  edit({ ...draft, leadMinutes: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Booking window (days, including today)
              <input
                type="number"
                min="1"
                max="90"
                required
                value={draft.advanceDays}
                onChange={(event) =>
                  edit({ ...draft, advanceDays: Number(event.target.value) })
                }
              />
            </label>
            <h3>Weekly working hours</h3>
            <p>
              Remove every interval to close a day. Use separate intervals for
              breaks. Each interval must fit at least one hour.
            </p>
            {draft.week.map((day) => (
              <div className="schedule-day" key={day.dayOfWeek}>
                <h4>{DAYS[day.dayOfWeek]}</h4>
                <Intervals
                  label={DAYS[day.dayOfWeek]}
                  value={day.intervals}
                  change={(intervals) =>
                    edit({
                      ...draft,
                      week: draft.week.map((d) =>
                        d.dayOfWeek === day.dayOfWeek ? { ...d, intervals } : d,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <h3>Holidays & special dates</h3>
            <p>
              Each date replaces that day's weekly hours. An empty date is
              closed.
            </p>
            {draft.exceptions.map((day, index) => (
              <div className="schedule-day" key={index}>
                <label>
                  Exception date
                  <input
                    type="date"
                    required
                    value={day.date}
                    onChange={(event) =>
                      edit({
                        ...draft,
                        exceptions: draft.exceptions.map((d, i) =>
                          i === index ? { ...d, date: event.target.value } : d,
                        ),
                      })
                    }
                  />
                </label>
                <Intervals
                  label={`Exception ${index + 1}`}
                  value={day.intervals}
                  change={(intervals) =>
                    edit({
                      ...draft,
                      exceptions: draft.exceptions.map((d, i) =>
                        i === index ? { ...d, intervals } : d,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    edit({
                      ...draft,
                      exceptions: draft.exceptions.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  Remove date exception
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={draft.exceptions.length >= 366}
              onClick={() =>
                edit({
                  ...draft,
                  exceptions: [
                    ...draft.exceptions,
                    { date: "", intervals: [] },
                  ],
                })
              }
            >
              Add special date
            </button>
            <hr />
            <label>
              Preview working slots for a date
              <input
                type="date"
                required
                value={previewDate}
                onChange={(event) => {
                  setPreviewDate(event.target.value);
                  setPreviewSlots(null);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setBusy(true);
                setError("");
                void scheduleApi
                  .preview(scheduleBody(draft), previewDate)
                  .then((value) => {
                    if (alive.current) {
                      setPreviewSlots(value.slots);
                      setImpact(
                        value.revision === revision ? value.impact : null,
                      );
                      if (value.revision !== revision)
                        setError(
                          "The saved schedule changed. Reload it before saving.",
                        );
                    }
                  })
                  .catch((err: unknown) => {
                    if (alive.current)
                      setError(
                        errorMessage(err, "Could not check existing bookings"),
                      );
                  })
                  .finally(() => {
                    if (alive.current) setBusy(false);
                  });
              }}
            >
              Check impact on existing bookings
            </button>
            {previewSlots && (
              <p role="status">
                Working arrival slots (IST; capacity and booking rules are
                checked when booking):{" "}
                {previewSlots.length
                  ? previewSlots
                      .map((slot) =>
                        new Date(slot.start).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      )
                      .join(", ")
                  : "Closed — no slots."}
              </p>
            )}
            {impact && <ImpactNotice value={impact} />}
            <button
              className="primary"
              type="submit"
              disabled={!impact || !!impact.conflictingGridBookings}
            >
              Save schedule
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
