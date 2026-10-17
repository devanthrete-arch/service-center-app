import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useStore } from "../domain/store";
import { autoflex, ApiError, errorMessage } from "../lib/api";
import { getAccessToken } from "../lib/session";
import { trackingUrl } from "../lib/tracking-link";
type Session = {
  id: string;
  version: number;
  state: string;
  expiresAt: string;
  identityReady: boolean;
  identityMode: "LOCAL_TEST" | "EXTERNAL";
  handoffPath?: string;
  customer: { id: string; revision: number } | null;
};
type Attempt = { path: string; body: object; key: string; version?: number };
export const REGISTRATION_PREFIX = "af-sc:registration:";
export function RegistrationHandoff({
  phone,
  linked,
}: {
  phone: string;
  linked: () => void;
}) {
  const { me } = useStore();
  const storageKey = `${REGISTRATION_PREFIX}${me.staff.id}:${me.center.id}:${phone}`;
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const token = getAccessToken();
  const current = () => alive.current && getAccessToken() === token;
  function save(value: { id?: string; attempt?: Attempt }) {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ ...value, expires: Date.now() + 20 * 60_000 }),
    );
  }
  useEffect(() => {
    alive.current = true;
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (value && value.expires > Date.now()) {
        if (
          value.attempt &&
          /^[a-z0-9-]{36}$/i.test(value.attempt.key) &&
          ((value.attempt.path === "/v1/center/registration-sessions" &&
            value.attempt.body?.phone === phone) ||
            (value.id &&
              value.attempt.path ===
                `/v1/center/registration-sessions/${value.id}/finalize` &&
              Number.isSafeInteger(value.attempt.version)) ||
            (value.id &&
              value.attempt.path ===
                `/v1/center/registration-sessions/${value.id}/cancel` &&
              Number.isSafeInteger(value.attempt.version)))
        )
          attempt.current = value.attempt;
        if (value.id && /^[a-f0-9-]{36}$/.test(value.id))
          void refresh(value.id);
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
    return () => {
      alive.current = false;
    };
  }, [storageKey]);
  let url = "";
  try {
    if (session?.handoffPath) {
      const base = new URL(trackingUrl("registration"));
      url = new URL(session.handoffPath, base.origin).href;
    }
  } catch {
    /* Readiness error is displayed below. */
  }
  useEffect(() => {
    let active = true;
    setQr("");
    if (url)
      void QRCode.toDataURL(url, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: "M",
      })
        .then((value) => {
          if (active) setQr(value);
        })
        .catch(() => {
          if (active)
            setError(
              "Could not create the QR. Copy the registration link instead.",
            );
        });
    return () => {
      active = false;
    };
  }, [url]);
  async function refresh(id = session?.id) {
    if (!id || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const row = await autoflex<Session>(
        `/v1/center/registration-sessions/${id}`,
        {},
        true,
      );
      if (current()) {
        setSession(row);
        if (
          (row.state === "COMPLETED" &&
            attempt.current?.path.endsWith("/finalize")) ||
          (row.state === "CANCELLED" &&
            attempt.current?.path.endsWith("/cancel"))
        )
          attempt.current = null;
        save({
          id: row.id,
          ...(attempt.current ? { attempt: attempt.current } : {}),
        });
        if (row.state === "COMPLETED") linked();
      }
    } catch (err) {
      if (current()) setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }
  async function command(kind: "start" | "finalize" | "cancel") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = attempt.current ?? {
        path:
          kind === "start"
            ? "/v1/center/registration-sessions"
            : `/v1/center/registration-sessions/${session!.id}/${kind}`,
        body: kind === "start" ? { phone } : {},
        key: crypto.randomUUID(),
        ...(kind === "start" ? {} : { version: session!.version }),
      };
      attempt.current = saved;
      save({ id: kind === "start" ? undefined : session?.id, attempt: saved });
      const row = await autoflex<Session>(
        saved.path,
        {
          method: "POST",
          body: JSON.stringify(saved.body),
          headers: {
            "Idempotency-Key": saved.key,
            ...(saved.version ? { "If-Match": String(saved.version) } : {}),
          },
        },
        true,
      );
      if (!current()) return;
      attempt.current = null;
      setSession(row);
      save({ id: row.id });
      if (row.state === "COMPLETED") linked();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status >= 400 &&
        err.status < 500 &&
        ![408, 429].includes(err.status)
      ) {
        attempt.current = null;
        try {
          if (session) save({ id: session.id });
          else sessionStorage.removeItem(storageKey);
        } catch {
          /* Recovery remains in memory. */
        }
      }
      if (current()) setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }
  if (!me.permissions.includes("customers:register"))
    return (
      <p className="notice">
        A receptionist with customer-registration access must complete account
        registration.
      </p>
    );
  return (
    <section className="registration-handoff">
      <h4>Register this customer</h4>
      <p>
        The customer verifies on their own device and confirms this workshop.
        Historical visits and vehicle ownership are not transferred.
      </p>
      {error ? (
        <p className="notice red" role="alert">
          {error}
        </p>
      ) : null}
      {!session ? (
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => void command("start")}
        >
          {busy
            ? "Starting…"
            : attempt.current
              ? "Retry registration request"
              : "Start registration"}
        </button>
      ) : (
        <>
          <p role="status">
            <strong>
              {
                (
                  {
                    WAITING_CUSTOMER: "Waiting for customer",
                    CONSENTED: "Customer confirmed — ready to link",
                    COMPLETED: "Account linked",
                    CANCELLED: "Request cancelled",
                    EXPIRED: "Request expired",
                  } as Record<string, string>
                )[session.state]
              }
            </strong>
          </p>
          {session.identityMode === "LOCAL_TEST" ? (
            <p className="notice">Local demo identity verification only.</p>
          ) : null}
          {session.handoffPath ? (
            <>
              {qr ? (
                <img
                  src={qr}
                  width={240}
                  height={240}
                  alt="Scan to register and confirm this workshop"
                />
              ) : null}
              {url ? (
                <>
                  <label>
                    Customer registration link
                    <input readOnly value={url} />
                  </label>
                  <button
                    className="secondary"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(url)
                        .then(() => setCopied(true))
                        .catch(() =>
                          setError("Copy the link from the field above."),
                        )
                    }
                  >
                    {copied ? "Link copied" : "Copy registration link"}
                  </button>
                </>
              ) : (
                <p className="notice red">
                  Configure the customer website origin before sharing the
                  registration link.
                </p>
              )}
            </>
          ) : null}
          {!session.identityReady ? (
            <p className="notice">
              IAM verification is not configured. The request can be kept, but
              account linking remains blocked.
            </p>
          ) : null}
          <div className="intake-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Check customer confirmation
            </button>
            {session.state === "CONSENTED" && !attempt.current ? (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void command("finalize")}
              >
                Link account and continue
              </button>
            ) : null}
            {["WAITING_CUSTOMER", "CONSENTED"].includes(session.state) &&
            !attempt.current ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void command("cancel")}
              >
                Cancel request
              </button>
            ) : null}
            {["EXPIRED", "CANCELLED"].includes(session.state) ? (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  attempt.current = null;
                  void command("start");
                }}
              >
                Start a new request
              </button>
            ) : null}
            {attempt.current ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void command("start")}
              >
                Check saved request
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
