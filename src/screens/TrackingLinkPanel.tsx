import { useEffect, useRef, useState } from "react";
import { ApiError, autoflex } from "../lib/api";
import {
  ATTEMPT_PREFIX,
  REASONS,
  pendingAttempt,
  trackingUrl,
  type Attempt,
  type Reason,
} from "../lib/tracking-link";

type Current = { jobId: string; version: number; publicToken: string };
type Receipt = {
  jobId: string;
  version: number;
  rotationId: string;
  rotatedAt: string;
};
export type TrackingTransport = {
  current: (id: string, signal: AbortSignal) => Promise<Current>;
  rotate: (
    id: string,
    attempt: Attempt,
    signal: AbortSignal,
  ) => Promise<Receipt>;
};
const transport: TrackingTransport = {
  current: (id, signal) =>
    autoflex(
      `/v1/jobs/${id}/public-token`,
      { cache: "no-store", signal },
      true,
    ),
  rotate: (id, attempt, signal) =>
    autoflex(
      `/v1/jobs/${id}/public-token/rotate`,
      {
        method: "POST",
        cache: "no-store",
        signal,
        headers: {
          "If-Match": String(attempt.version),
          "Idempotency-Key": attempt.key,
        },
        body: JSON.stringify({ reason: attempt.reason }),
      },
      true,
    ),
};

export function TrackingLinkPanel({
  jobId,
  staffId,
  centerId,
  canReplace,
  close,
  changed,
  returnFocus,
  api = transport,
}: {
  jobId: string;
  staffId: string;
  centerId: string;
  canReplace: boolean;
  close: () => void;
  changed: () => Promise<void>;
  returnFocus?: () => void;
  api?: TrackingTransport;
}) {
  const storageKey = `${ATTEMPT_PREFIX}${staffId}:${centerId}:${jobId}`;
  const [attempt, setAttempt] = useState<Attempt | null>(() => {
    try {
      return pendingAttempt(sessionStorage.getItem(storageKey));
    } catch {
      return null;
    }
  });
  const [current, setCurrent] = useState<Current | null>(null);
  const [reason, setReason] = useState<Reason>("LINK_EXPOSED");
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [success, setSuccess] = useState(false);
  const [detailWarning, setDetailWarning] = useState("");
  const [denied, setDenied] = useState(false),
    [storageWarning, setStorageWarning] = useState("");
  const [url, setUrl] = useState("");
  const [openVerified, setOpenVerified] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    mounted = useRef(true),
    sequence = useRef(0);
  const inflight = useRef<AbortController | null>(null),
    locked = useRef(false);
  let configError = "";
  try {
    trackingUrl("configuration-check");
  } catch {
    configError =
      "Sharing is unavailable: configure a valid customer website origin. You can still replace an exposed link.";
  }

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      mounted.current = false;
      sequence.current++;
      inflight.current?.abort();
      if (returnFocus) returnFocus();
      else if (previous?.isConnected) previous.focus();
    };
  }, []);
  function persist(value: Attempt | null) {
    setAttempt(value);
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch {
      setStorageWarning(
        "Retry details are held in memory. Reloading will lose the local retry context.",
      );
    }
  }
  async function request<T>(
    call: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    inflight.current?.abort();
    inflight.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      return await call(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }
  function accessFailure(error: unknown): boolean {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
      setDenied(true);
      setCurrent(null);
      setUrl("");
      persist(null);
      setMessage(
        error.status === 401
          ? "Your session ended. Close this panel and sign in again."
          : error.status === 403
            ? "You no longer have access to this tracking link. Close this panel."
            : "This job is unavailable. Close this panel and return to the jobs list.",
      );
      return true;
    }
    return false;
  }
  async function load(copy = false, open = false): Promise<void> {
    const serial = ++sequence.current;
    setBusy(true);
    setCurrent(null);
    setUrl("");
    setOpenVerified(false);
    setConfirm(false);
    setMessage("");
    try {
      const row = await request((signal) => api.current(jobId, signal));
      if (!mounted.current || serial !== sequence.current) return;
      if (
        row.jobId !== jobId ||
        !Number.isInteger(row.version) ||
        row.version < 1 ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(row.publicToken)
      )
        throw new Error("Invalid current-link response.");
      setCurrent(row);
      if (!configError) {
        const link = trackingUrl(row.publicToken);
        setUrl(link);
        setOpenVerified(open);
        if (copy) {
          try {
            await navigator.clipboard.writeText(link);
            if (mounted.current && serial === sequence.current)
              setMessage("Copied. Share the new link with the customer.");
          } catch {
            if (mounted.current && serial === sequence.current)
              setMessage(
                "Copy failed. Select the freshly loaded URL and copy it manually.",
              );
          }
        }
      }
    } catch (error) {
      if (mounted.current && serial === sequence.current) {
        if (!accessFailure(error))
          setMessage("Could not load the current link. Refresh to try again.");
      }
    } finally {
      if (mounted.current && serial === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!attempt) void load();
  }, []); // pending commands are retried only by an explicit click

  async function send(value: Attempt) {
    if (locked.current || !canReplace) return;
    locked.current = true;
    persist(value);
    setBusy(true);
    setConfirm(false);
    setCurrent(null);
    setUrl("");
    setMessage("");
    try {
      const receipt = await request((signal) =>
        api.rotate(jobId, value, signal),
      );
      if (!mounted.current) return;
      if (
        receipt.jobId !== jobId ||
        receipt.version !== value.version + 1 ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          receipt.rotationId,
        ) ||
        !Number.isFinite(Date.parse(receipt.rotatedAt))
      )
        throw new Error("Invalid command acknowledgement");
      persist(null);
      setSuccess(true);
      // A successful mutation remains acknowledged even if either subsequent read fails.
      try {
        await changed();
        if (mounted.current) setDetailWarning("");
      } catch {
        if (mounted.current)
          setDetailWarning(
            "Job details could not refresh. Reload the job before another job action.",
          );
      }
      if (mounted.current) await load();
    } catch (error) {
      if (!mounted.current) return;
      const definitive =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        ![408, 429].includes(error.status);
      if (definitive) {
        persist(null);
        if (!accessFailure(error))
          setMessage(
            error instanceof ApiError && error.status === 409
              ? "This job changed. Refresh the link and confirm again."
              : "Replacement was refused. Refresh and review before another attempt.",
          );
      } else
        setMessage(
          "The replacement result is uncertain. Check the result with the same attempt before continuing.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="tracking-dialog"
      aria-labelledby="tracking-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else close();
      }}
    >
      <h3 id="tracking-title">Tracking link</h3>
      <p>
        Anyone with this link can see limited service progress. No message is
        sent automatically.
      </p>
      {configError && <p role="alert">{configError}</p>}
      {success && (
        <p role="status">
          Tracking link replaced. Share the new link with the customer.
        </p>
      )}
      {storageWarning && <p role="alert">{storageWarning}</p>}
      {detailWarning && <p role="alert">{detailWarning}</p>}
      <p role="status" aria-live="polite">
        {busy ? "Checking tracking link…" : message}
      </p>
      {url && !busy && (
        <label>
          Current tracking URL
          <input
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
      {attempt && !busy && !denied && (
        <>
          <p role="status">
            A previous replacement is unresolved. Reading the current link does
            not confirm whether that attempt committed.{" "}
            {canReplace
              ? "Check replacement result before starting another replacement."
              : "You can read the current link, but checking the replacement result requires jobs:update permission."}
          </p>
          <button
            className="primary"
            disabled={!canReplace}
            onClick={() => void send(attempt)}
          >
            Check replacement result
          </button>
        </>
      )}
      {!denied && !busy && (
        <>
          <button onClick={() => void load()}>Refresh link</button>
          {url && (
            <>
              <button onClick={() => void load(true)}>Copy link</button>
              <button onClick={() => void load(false, true)}>
                Open timeline
              </button>
              {openVerified && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  Open verified timeline
                </a>
              )}
            </>
          )}
          {!attempt && canReplace && current && !confirm && (
            <button onClick={() => setConfirm(true)}>Replace link</button>
          )}
        </>
      )}
      {confirm && current && !attempt && canReplace && !busy && (
        <section>
          <p>
            Replace this tracking link? Anyone using an older link, including a
            printed QR, will lose access. The job and its history will stay
            available through the new link. No message will be sent
            automatically.
          </p>
          <label>
            Reason
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as Reason)}
            >
              {Object.entries(REASONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setConfirm(false)}>Cancel replacement</button>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void send({
                schema: 1,
                key: crypto.randomUUID(),
                version: current.version,
                reason,
              })
            }
          >
            Confirm replacement
          </button>
        </section>
      )}
      <button disabled={busy} onClick={close}>
        Close
      </button>
    </dialog>
  );
}
