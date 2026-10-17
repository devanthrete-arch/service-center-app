import { useEffect, useRef, useState } from "react";
import { autoflex, ApiError, errorMessage } from "../lib/api";
import { getAccessToken } from "../lib/session";
import { useStore } from "../domain/store";
import { money } from "../domain/types";
import { BILLING_ATTEMPT_PREFIX } from "../lib/billing";
import { InvoiceDownload } from "./InvoiceDownload";
type Note = {
  id: string;
  version: number;
  kind: "CREDIT" | "DEBIT";
  state: string;
  reason: string;
  totalInr: string;
  noteNumber: string | null;
  paymentState: string;
  lines: { description: string; netInr: string; taxInr: string }[];
};
type Data = {
  jobVersion: number;
  lines: { id: string; description: string; netInr: string }[];
  notes: Note[];
};
type Attempt = {
  kind: "propose" | "withdraw" | "pay";
  noteId?: string;
  body: object;
  key: string;
  version: number;
};
export function FinancialNotes({ invoiceId }: { invoiceId: string }) {
  const store = useStore();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [reason, setReason] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const alive = useRef(true);
  const inFlight = useRef(false);
  const token = getAccessToken();
  const storageKey = `${BILLING_ATTEMPT_PREFIX}note:${store.me.staff.id}:${invoiceId}`;
  const [attempt, setAttempt] = useState<Attempt | null>(() => {
    try {
      const a = JSON.parse(
        sessionStorage.getItem(storageKey) || "null",
      ) as Attempt | null;
      return a &&
        ["propose", "withdraw", "pay"].includes(a.kind) &&
        /^[a-f0-9-]{36}$/i.test(a.key) &&
        Number.isSafeInteger(a.version) &&
        a.version > 0 &&
        a.body &&
        typeof a.body === "object" &&
        (a.kind === "propose" ||
          (typeof a.noteId === "string" && /^[a-f0-9-]{36}$/i.test(a.noteId)))
        ? a
        : null;
    } catch {
      return null;
    }
  });
  const current = () => alive.current && token === getAccessToken();
  async function load() {
    try {
      const value = await autoflex<Data>(
        `/v1/center/invoices/${invoiceId}/notes`,
        {},
        true,
      );
      if (current()) setData(value);
    } catch (err) {
      if (current()) setError(errorMessage(err));
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [invoiceId, token]);
  async function execute(a: Attempt) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(a));
      setAttempt(a);
      await autoflex(
        a.kind === "propose"
          ? `/v1/center/invoices/${invoiceId}/notes`
          : `/v1/center/financial-notes/${a.noteId}/${a.kind === "pay" ? "payment" : "withdraw"}`,
        {
          method: "POST",
          headers: { "If-Match": String(a.version), "Idempotency-Key": a.key },
          body: JSON.stringify(a.body),
        },
        true,
      );
      if (!current()) return;
      sessionStorage.removeItem(storageKey);
      setAttempt(null);
      setAmounts({});
      setReason("");
      await load();
    } catch (err) {
      if (!current()) return;
      if (
        err instanceof ApiError &&
        err.status >= 400 &&
        err.status < 500 &&
        ![408, 429].includes(err.status)
      ) {
        sessionStorage.removeItem(storageKey);
        setAttempt(null);
      }
      setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }
  return (
    <section className="invoice-section">
      <h4>Financial corrections</h4>
      <p className="hint">
        The paid invoice stays unchanged. Finance reviews and issues a separate
        note. Credits do not record refunds. Additional charges need the
        original recipient’s acceptance.
      </p>
      {error ? (
        <p role="alert" className="notice red">
          {error}
        </p>
      ) : null}
      <button
        className="secondary"
        type="button"
        disabled={busy}
        onClick={() => void load()}
      >
        Refresh corrections
      </button>
      {attempt ? (
        <div className="notice">
          <p>A saved correction request needs confirmation.</p>
          <button
            className="secondary"
            type="button"
            disabled={
              busy ||
              (attempt.kind === "pay"
                ? !store.can("billing:record-payment")
                : !store.can("billing:correct"))
            }
            onClick={() => void execute(attempt)}
          >
            Check saved correction
          </button>
        </div>
      ) : null}
      {data?.notes.map((n) => (
        <article className="invoice-preview" key={n.id}>
          <h4>
            {n.noteNumber ??
              (n.kind === "CREDIT"
                ? "Credit proposal"
                : "Additional charge proposal")}
          </h4>
          <p>
            {n.reason} · {n.state.toLowerCase().replaceAll("_", " ")} ·{" "}
            {money(Number(n.totalInr))}
          </p>
          {n.lines.map((l, index) => (
            <p className="hint" key={index}>
              {l.description}: net {money(Number(l.netInr))}, tax{" "}
              {money(Number(l.taxInr))}
            </p>
          ))}
          {n.state === "ISSUED" && n.noteNumber ? (
            <InvoiceDownload
              id={n.id}
              number={n.noteNumber}
              canRetry={store.can("billing:correct")}
              note
            />
          ) : null}
          {n.kind === "CREDIT" ? (
            <p className="hint">No refund recorded.</p>
          ) : (
            <p className="hint">
              {n.paymentState === "DUE"
                ? "Full counter payment is due."
                : n.paymentState === "PAID"
                  ? "Counter payment recorded."
                  : "This proposal is not payable."}
            </p>
          )}
          {!attempt &&
          store.can("billing:correct") &&
          ["PROPOSED", "ACCEPTED", "DECLINED"].includes(n.state) ? (
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void execute({
                  kind: "withdraw",
                  noteId: n.id,
                  body: {},
                  key: crypto.randomUUID(),
                  version: n.version,
                })
              }
            >
              Withdraw proposal
            </button>
          ) : null}
          {!attempt &&
          n.paymentState === "DUE" &&
          store.can("billing:record-payment") ? (
            <fieldset disabled={busy}>
              <legend>Record full debit-note payment</legend>
              <label>
                Method
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option>CASH</option>
                  <option>UPI</option>
                  <option>CARD</option>
                </select>
              </label>
              <label>
                Payment reference
                <input
                  maxLength={64}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <button
                className="primary"
                type="button"
                onClick={() =>
                  void execute({
                    kind: "pay",
                    noteId: n.id,
                    body: { method, reference, amountInr: n.totalInr },
                    key: crypto.randomUUID(),
                    version: n.version,
                  })
                }
              >
                Record {money(Number(n.totalInr))} received
              </button>
            </fieldset>
          ) : null}
        </article>
      ))}
      {data && !attempt && store.can("billing:correct") ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const lines = Object.entries(amounts)
              .filter(([, v]) => Number(v) > 0)
              .map(([sourceLineId, netInr]) => ({ sourceLineId, netInr }));
            if (!lines.length) {
              setError("Enter an amount for at least one original line.");
              return;
            }
            void execute({
              kind: "propose",
              body: { kind, reason, lines },
              key: crypto.randomUUID(),
              version: data.jobVersion,
            });
          }}
        >
          <fieldset className="invoice-fields" disabled={busy}>
            <legend>Propose a correction</legend>
            <label>
              Type
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as "CREDIT" | "DEBIT")}
              >
                <option value="CREDIT">
                  Credit — reduce an original charge
                </option>
                <option value="DEBIT">
                  Debit — request an additional charge
                </option>
              </select>
            </label>
            <label>
              Reason
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {data.lines.map((l) => (
              <label key={l.id}>
                {l.description} · original net {money(Number(l.netInr))}
                <input
                  aria-label={`Correction net amount for ${l.description}`}
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]{1,2})?"
                  placeholder="Net correction amount (INR)"
                  value={amounts[l.id] ?? ""}
                  onChange={(e) =>
                    setAmounts({ ...amounts, [l.id]: e.target.value })
                  }
                />
              </label>
            ))}
            <p className="hint">
              Amounts exclude tax. The server applies the original tax
              treatment. Unconfigured or out-of-period corrections remain
              blocked.
            </p>
            <button className="primary">Submit for review</button>
          </fieldset>
        </form>
      ) : null}
    </section>
  );
}
