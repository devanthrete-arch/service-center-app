import { FinancialNotes } from "./FinancialNotes";
import { InvoiceDownload } from "./InvoiceDownload";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../domain/store";
import { staffApi } from "../domain/client";
import { CLOSE_CHECKS, money, type JobDetail } from "../domain/types";
import { autoflex, ApiError } from "../lib/api";
import {
  BILLING_ATTEMPT_PREFIX,
  loadBillingAttempt,
  type BillingAttempt,
} from "../lib/billing";
import { getAccessToken } from "../lib/session";
import { ErrorText, Modal } from "./ui";

type Buyer = {
  type: "INDIVIDUAL" | "BUSINESS";
  name: string;
  address: string;
  pin: string;
  stateCode: string;
  gstin?: string;
};
type Selection = {
  supplyContext: "" | "AT_CENTER" | "PICKUP_DROP" | "FLEET" | "OFFSITE";
  placeOfSupplyRuleKey: string;
  buyer: Buyer;
  supplyDate: string;
  lineRules: {
    lineItemId: string;
    ruleKey: string;
    discountInr?: string;
    discountReason?: string;
  }[];
};
type Options = {
  discounts: { maxBps: number } | null;
  placeOfSupplyRules: {
    key: string;
    context: Selection["supplyContext"];
    buyerType: Buyer["type"];
    buyerStateCode: string;
    supplyStateCode: string;
  }[];
  jobVersion: number;
  buyerModes: Buyer["type"][];
  buyerName: string;
  supplyDate: string;
  rules: { key: string; kind: string; classificationCode: string }[];
  lines: { id: string; kind: string; description: string; amountInr: string }[];
};
type Preview = {
  placeOfSupply: { stateCode: string; context: string; ruleKey: string };
  fingerprint: string;
  jobVersion: number;
  subtotalInr: string;
  taxInr: string;
  totalInr: string;
  blockedReasons: string[];
  documentKind: string;
};
type Bill = {
  id: string;
  invoiceNumber: string;
  status: "DUE" | "PAID" | "VOID";
  subtotalInr: string;
  taxInr: string;
  totalInr: string;
  documentKind: string;
  schemaVersion: number;
  voidReason?: string;
};
const read = <T,>(path: string) => autoflex<T>(path, {}, true);

export function InvoicePanel({
  job,
  update,
  close,
  legacy,
}: {
  job: JobDetail;
  update: (job: JobDetail) => void;
  close: () => void;
  legacy: () => void;
}) {
  const store = useStore();
  const storageKey = `${BILLING_ATTEMPT_PREFIX}${store.me.staff.id}:${store.me.center.id}:${job.id}`;
  const [attempt, setAttempt] = useState(() => loadBillingAttempt(storageKey));
  const [history, setHistory] = useState<Bill[]>([]);
  const [bill, setBill] = useState<Bill | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewElement = useRef<HTMLElement>(null);
  useEffect(() => {
    if (preview) previewElement.current?.focus();
  }, [preview]);
  const [error, setError] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const [blocked, setBlocked] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [returned, setReturned] = useState<string[]>([]);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const canIssue = store.can("billing:issue");
  const canCorrect = store.can("billing:correct");
  const canPay =
    store.can("billing:record-payment") && store.can("jobs:update");

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const loadToken = getAccessToken();
    const currentRequest = () =>
      !cancelled && alive.current && getAccessToken() === loadToken;
    void (async () => {
      const readiness = await read<{
        enabled: boolean;
        ready: boolean;
        configured: boolean;
      }>("/v1/center/billing-readiness");
      if (!currentRequest()) return;
      let current: Bill | null = null;
      try {
        current = await read<Bill>(`/v1/jobs/${job.id}/invoice`);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
      if (!currentRequest()) return;
      setBill(current);
      const old = await read<Bill[]>(`/v1/jobs/${job.id}/invoice-history`);
      if (!currentRequest()) return;
      setHistory(old.filter((i) => i.status === "VOID"));
      if (!readiness.enabled) {
        if (
          !current &&
          !readiness.configured &&
          !attempt &&
          job.status === "READY_FOR_PICKUP"
        ) {
          legacy();
          return;
        }
        setBlocked(
          "New billing actions are awaiting activation for this center. Saved documents remain available.",
        );
        return;
      }
      if (!current && canIssue && readiness.ready && !attempt) {
        const value = await read<Options>(`/v1/jobs/${job.id}/invoice-options`);
        if (!currentRequest()) return;
        setOptions(value);
        setSelection({
          buyer: {
            type: value.buyerModes[0],
            name: value.buyerName,
            address: "",
            pin: "",
            stateCode: "",
          },
          supplyDate: value.supplyDate,
          supplyContext: "",
          placeOfSupplyRuleKey: "",
          lineRules: value.lines.map((l) => ({
            lineItemId: l.id,
            ruleKey:
              value.rules.filter((r) => r.kind === l.kind).length === 1
                ? value.rules.find((r) => r.kind === l.kind)!.key
                : "",
          })),
        });
      } else if (!current && !attempt)
        setBlocked(
          readiness.ready
            ? "Ask a colleague with invoice issue permission to prepare this bill."
            : "Autoflex finance must approve this center’s billing setup before issue.",
        );
    })()
      .catch((err) => {
        if (currentRequest())
          setError(
            err instanceof Error ? err.message : "Could not load billing",
          );
      })
      .finally(() => {
        if (currentRequest()) setLoaded(true);
      });
    return () => {
      cancelled = true;
      alive.current = false;
    };
    // A new invoice changes job.version; preserve the current buyer and retry intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, storageKey, revision]);

  function edit(next: Selection) {
    const rule = options?.placeOfSupplyRules.find(
      (rule) => rule.key === next.placeOfSupplyRuleKey,
    );
    const matches =
      rule?.context === next.supplyContext &&
      rule?.buyerType === next.buyer.type &&
      rule?.buyerStateCode === next.buyer.stateCode;
    setSelection(matches ? next : { ...next, placeOfSupplyRuleKey: "" });
    setPreview(null);
  }
  async function execute(saved: BillingAttempt) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const sessionToken = getAccessToken();
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(saved));
      setAttempt(saved);
      const result = await autoflex<Bill | JobDetail>(
        saved.kind === "cancel"
          ? `/v1/center/invoices/${saved.invoiceId}/cancel`
          : `/v1/jobs/${job.id}/${saved.kind === "issue" ? "invoice" : "close"}`,
        {
          method: "POST",
          headers: {
            "If-Match": String(saved.version),
            "Idempotency-Key": saved.key,
          },
          body: JSON.stringify(saved.body),
        },
        true,
      );
      if (getAccessToken() !== sessionToken) return;
      sessionStorage.removeItem(storageKey);
      setAttempt(null);
      if (!alive.current) return;
      if (saved.kind === "close") {
        update(result as JobDetail);
        close();
      } else if (saved.kind === "cancel") {
        setBill(null);
        setPreview(null);
        setSelection(null);
        setCorrectionReason("");
        const latest = await staffApi.job(job.id);
        if (!alive.current || getAccessToken() !== sessionToken) return;
        update(latest);
        setRevision((v) => v + 1);
      } else {
        setBill(result as Bill);
        setPreview(null);
        const latest = await staffApi.job(job.id);
        if (!alive.current || getAccessToken() !== sessionToken) return;
        update(latest);
      }
    } catch (err) {
      if (getAccessToken() !== sessionToken) return;
      if (
        err instanceof ApiError &&
        err.status >= 400 &&
        err.status < 500 &&
        ![408, 429].includes(err.status)
      ) {
        sessionStorage.removeItem(storageKey);
        setAttempt(null);
        setPreview(null);
      }
      if (alive.current)
        setError(
          err instanceof Error ? err.message : "Could not confirm this action",
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function makePreview() {
    if (!selection || inFlight.current) return;
    const previewToken = getAccessToken();
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await autoflex<Preview>(
        `/v1/jobs/${job.id}/invoice-preview`,
        { method: "POST", body: JSON.stringify(selection) },
        true,
      );
      if (alive.current && getAccessToken() === previewToken)
        setPreview(result);
    } catch (err) {
      if (alive.current)
        setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Modal title="Invoice and counter payment" close={close}>
      <div className="invoice-flow">
        <p className="invoice-context">
          {job.jobNumber} · {job.vehicle?.registrationNumber ?? "Vehicle visit"}
        </p>
        <ol className="invoice-progress" aria-label="Billing progress">
          {["Prepare", "Issue", "Payment"].map((label, index) => {
            const phase = bill
              ? bill.status === "PAID"
                ? 3
                : 2
              : preview
                ? 1
                : 0;
            return (
              <li
                key={label}
                aria-current={index === Math.min(phase, 2) ? "step" : undefined}
                className={index < phase ? "is-complete" : ""}
              >
                <span aria-hidden="true">
                  {index < phase ? "✓" : index + 1}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
        <ErrorText error={error} />
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() => {
            setError("");
            setBlocked("");
            setLoaded(false);
            setPreview(null);
            setOptions(null);
            setSelection(null);
            void staffApi
              .job(job.id)
              .then(update)
              .catch(() => {});
            setRevision((v) => v + 1);
          }}
        >
          Refresh billing
        </button>
        {!loaded ? <p>Loading billing…</p> : null}
        {blocked ? <p className="notice">{blocked}</p> : null}
        {history.length ? (
          <section className="invoice-section">
            <h4>Cancelled invoices</h4>
            {history.map((i) => (
              <article key={i.id}>
                <p>{i.invoiceNumber} · Cancelled — do not collect payment.</p>
                {i.voidReason ? <p className="hint">{i.voidReason}</p> : null}
                {i.schemaVersion === 2 ? (
                  <InvoiceDownload
                    id={i.id}
                    number={i.invoiceNumber}
                    canRetry={canCorrect}
                  />
                ) : null}
              </article>
            ))}
          </section>
        ) : null}
        {attempt ? (
          <div className="notice">
            <p>
              A previous{" "}
              {attempt.kind === "issue"
                ? "invoice"
                : attempt.kind === "cancel"
                  ? "cancellation"
                  : "payment"}{" "}
              request needs confirmation. Retry checks the same saved request.
            </p>
            <button
              type="button"
              className="primary"
              disabled={
                busy ||
                (attempt.kind === "issue"
                  ? !canIssue
                  : attempt.kind === "cancel"
                    ? !canCorrect
                    : !canPay)
              }
              onClick={() => void execute(attempt)}
            >
              Check saved result
            </button>
          </div>
        ) : null}
        {!bill && selection && options && !attempt ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void makePreview();
            }}
          >
            <fieldset className="invoice-fields" disabled={busy}>
              <fieldset className="invoice-section">
                <legend>Buyer details</legend>
                <p className="hint">
                  Use the billing details supplied by the customer.
                </p>
                <label>
                  Buyer type
                  <select
                    value={selection.buyer.type}
                    onChange={(e) =>
                      edit({
                        ...selection,
                        buyer: {
                          ...selection.buyer,
                          type: e.target.value as Buyer["type"],
                          gstin: undefined,
                        },
                      })
                    }
                  >
                    {options.buyerModes.map((v) => (
                      <option key={v} value={v}>
                        {v === "INDIVIDUAL"
                          ? "Individual"
                          : "GST-registered business"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Billing name
                  <input
                    required
                    maxLength={160}
                    value={selection.buyer.name}
                    onChange={(e) =>
                      edit({
                        ...selection,
                        buyer: { ...selection.buyer, name: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  Billing address
                  <textarea
                    required
                    maxLength={500}
                    value={selection.buyer.address}
                    onChange={(e) =>
                      edit({
                        ...selection,
                        buyer: { ...selection.buyer, address: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  PIN
                  <input
                    required
                    pattern="[1-9][0-9]{5}"
                    inputMode="numeric"
                    maxLength={6}
                    value={selection.buyer.pin}
                    onChange={(e) =>
                      edit({
                        ...selection,
                        buyer: { ...selection.buyer, pin: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  GST state code
                  <input
                    required
                    pattern="[0-9]{2}"
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="e.g. 29 for Karnataka"
                    value={selection.buyer.stateCode}
                    onChange={(e) =>
                      edit({
                        ...selection,
                        buyer: {
                          ...selection.buyer,
                          stateCode: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                {selection.buyer.type === "BUSINESS" ? (
                  <label>
                    Buyer GSTIN
                    <input
                      required
                      minLength={15}
                      maxLength={15}
                      value={selection.buyer.gstin ?? ""}
                      onChange={(e) =>
                        edit({
                          ...selection,
                          buyer: {
                            ...selection.buyer,
                            gstin: e.target.value.toUpperCase(),
                          },
                        })
                      }
                    />
                  </label>
                ) : null}
              </fieldset>
              <fieldset className="invoice-section">
                <legend>Service & tax treatment</legend>
                <label>
                  Supply date
                  <input
                    required
                    type="date"
                    max={options.supplyDate}
                    value={selection.supplyDate}
                    onChange={(e) =>
                      edit({ ...selection, supplyDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  Service context confirmed by staff
                  <select
                    required
                    value={selection.supplyContext}
                    onChange={(e) =>
                      edit({
                        ...selection,
                        supplyContext: e.target
                          .value as Selection["supplyContext"],
                      })
                    }
                  >
                    <option value="">Choose how this job was performed</option>
                    <option value="AT_CENTER">Work at this center</option>
                    <option value="PICKUP_DROP">Pickup and drop</option>
                    <option value="FLEET">Company fleet</option>
                    <option value="OFFSITE">Work at another location</option>
                  </select>
                </label>
                <label className="invoice-wide">
                  Approved place-of-supply case
                  <select
                    required
                    value={selection.placeOfSupplyRuleKey}
                    onChange={(e) =>
                      edit({
                        ...selection,
                        placeOfSupplyRuleKey: e.target.value,
                      })
                    }
                  >
                    <option value="">Choose a finance-approved case</option>
                    {options.placeOfSupplyRules
                      .filter(
                        (rule) =>
                          rule.context === selection.supplyContext &&
                          rule.buyerType === selection.buyer.type &&
                          rule.buyerStateCode === selection.buyer.stateCode,
                      )
                      .map((rule) => (
                        <option key={rule.key} value={rule.key}>
                          {rule.key} · Supply state {rule.supplyStateCode}
                        </option>
                      ))}
                  </select>
                </label>
                {selection.supplyContext &&
                !options.placeOfSupplyRules.some(
                  (rule) =>
                    rule.context === selection.supplyContext &&
                    rule.buyerType === selection.buyer.type &&
                    rule.buyerStateCode === selection.buyer.stateCode,
                ) ? (
                  <p className="notice">
                    No approved supply case matches this buyer and service
                    context. Ask Autoflex finance to review it before invoicing.
                  </p>
                ) : null}
              </fieldset>
              <fieldset className="invoice-section">
                <legend>Included work</legend>
                {options.lines.map((line) => (
                  <label className="invoice-wide" key={line.id}>
                    {line.description} · {money(Number(line.amountInr))}
                    <select
                      required
                      value={
                        selection.lineRules.find(
                          (r) => r.lineItemId === line.id,
                        )?.ruleKey ?? ""
                      }
                      onChange={(e) =>
                        edit({
                          ...selection,
                          lineRules: selection.lineRules.map((r) =>
                            r.lineItemId === line.id
                              ? { ...r, ruleKey: e.target.value }
                              : r,
                          ),
                        })
                      }
                    >
                      <option value="">Choose approved classification</option>
                      {options.rules
                        .filter((r) => r.kind === line.kind)
                        .map((r) => (
                          <option value={r.key} key={r.key}>
                            {r.key} · {r.classificationCode}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
                {options.discounts ? (
                  <div className="invoice-wide">
                    <h4>Optional line discounts</h4>
                    <p className="hint">
                      Approved limit: {options.discounts.maxBps / 100}% per
                      line, applied before tax.
                    </p>
                    {options.lines.map((line) => (
                      <fieldset key={line.id}>
                        <legend>{line.description}</legend>
                        <label>
                          Discount (INR)
                          <input
                            inputMode="decimal"
                            pattern="[0-9]+([.][0-9]{1,2})?"
                            value={
                              selection.lineRules.find(
                                (r) => r.lineItemId === line.id,
                              )?.discountInr ?? ""
                            }
                            onChange={(e) =>
                              edit({
                                ...selection,
                                lineRules: selection.lineRules.map((r) =>
                                  r.lineItemId === line.id
                                    ? {
                                        ...r,
                                        discountInr:
                                          e.target.value || undefined,
                                      }
                                    : r,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Discount reason
                          <input
                            maxLength={300}
                            value={
                              selection.lineRules.find(
                                (r) => r.lineItemId === line.id,
                              )?.discountReason ?? ""
                            }
                            onChange={(e) =>
                              edit({
                                ...selection,
                                lineRules: selection.lineRules.map((r) =>
                                  r.lineItemId === line.id
                                    ? {
                                        ...r,
                                        discountReason:
                                          e.target.value || undefined,
                                      }
                                    : r,
                                ),
                              })
                            }
                          />
                        </label>
                      </fieldset>
                    ))}
                  </div>
                ) : null}
              </fieldset>
              <button className="primary invoice-review" type="submit">
                Review invoice
              </button>
            </fieldset>
            {preview ? (
              <section
                ref={previewElement}
                tabIndex={-1}
                className="invoice-preview"
                aria-label="Invoice preview"
              >
                <h4>Review before issuing</h4>
                <InvoiceTotals value={preview} />
                <p>This preview has no invoice number.</p>
                <p>
                  Place of supply: state {preview.placeOfSupply.stateCode} ·
                  approved case {preview.placeOfSupply.ruleKey}
                </p>
                {preview.blockedReasons.length ? (
                  <p>
                    Business invoice registration is required before this bill
                    can be issued. Contact Autoflex finance.
                  </p>
                ) : (
                  <button
                    className="primary"
                    type="button"
                    disabled={busy || !canIssue}
                    onClick={() =>
                      void execute({
                        kind: "issue",
                        key: crypto.randomUUID(),
                        version: preview.jobVersion,
                        body: {
                          selection,
                          previewFingerprint: preview.fingerprint,
                        },
                      })
                    }
                  >
                    Issue invoice
                  </button>
                )}
              </section>
            ) : null}
          </form>
        ) : null}
        {bill ? (
          <>
            <section className="invoice-preview" aria-label="Issued invoice">
              <div className="invoice-issued">
                <strong>{bill.invoiceNumber}</strong>
                <span
                  className={`badge ${bill.status === "PAID" ? "green" : "amber"}`}
                >
                  {bill.status === "DUE"
                    ? "Payment due"
                    : bill.status === "PAID"
                      ? "Paid"
                      : "Void"}
                </span>
              </div>
              <InvoiceTotals value={bill} />
            </section>
            <InvoiceDownload
              id={bill.id}
              number={bill.invoiceNumber}
              canRetry={canCorrect}
            />
            {bill.status === "PAID" && bill.schemaVersion === 2 ? (
              <FinancialNotes invoiceId={bill.id} />
            ) : null}
            {bill.status === "DUE" && canCorrect && !attempt ? (
              <details className="invoice-correction">
                <summary>Correct an unpaid invoice</summary>
                <p>
                  The original invoice and PDF remain in history. A replacement
                  receives a new number. Paid invoices cannot be cancelled here.
                </p>
                <label>
                  Reason for cancellation
                  <textarea
                    value={correctionReason}
                    maxLength={500}
                    disabled={busy}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || correctionReason.trim().length < 3}
                  onClick={() =>
                    void execute({
                      kind: "cancel",
                      invoiceId: bill.id,
                      key: crypto.randomUUID(),
                      version: job.version,
                      body: { reason: correctionReason.trim() },
                    })
                  }
                >
                  Cancel this unpaid invoice
                </button>
              </details>
            ) : null}
            {bill.status === "DUE" && !canPay ? (
              <p className="notice">
                A staff member with payment access must confirm receipt and
                close this job.
              </p>
            ) : null}
            {bill.status === "DUE" && !attempt && !blocked ? (
              <fieldset className="invoice-section" disabled={busy || !canPay}>
                <legend>Counter payment</legend>
                <p>
                  Confirm that the garage received the full payment before
                  closing this job. The issued invoice will stay unchanged.
                </p>
                {Number(bill.totalInr) > 0 ? (
                  <>
                    <label>
                      Payment method
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                      >
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">Card</option>
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
                  </>
                ) : null}
                {job.lineItems
                  .filter(
                    (l) =>
                      l.kind === "PART" &&
                      ["INCLUDED", "APPROVED"].includes(l.status),
                  )
                  .map((l) => (
                    <label className="check" key={l.id}>
                      <input
                        type="checkbox"
                        checked={returned.includes(l.id)}
                        onChange={(e) =>
                          setReturned((ids) =>
                            e.target.checked
                              ? [...ids, l.id]
                              : ids.filter((id) => id !== l.id),
                          )
                        }
                      />
                      Returned {l.description}
                    </label>
                  ))}
                {job.skippedSteps.length
                  ? CLOSE_CHECKS.map((c) => (
                      <label key={c.key} className="check">
                        <input
                          type="checkbox"
                          checked={!!checks[c.key]}
                          onChange={(e) =>
                            setChecks((value) => ({
                              ...value,
                              [c.key]: e.target.checked,
                            }))
                          }
                        />
                        {c.label}
                      </label>
                    ))
                  : null}
                <label>
                  Final notes
                  <textarea
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="primary"
                  disabled={
                    busy ||
                    !canPay ||
                    (job.skippedSteps.length > 0 &&
                      CLOSE_CHECKS.some((c) => !checks[c.key]))
                  }
                  onClick={() =>
                    void execute({
                      kind: "close",
                      key: crypto.randomUUID(),
                      version: job.version,
                      body: {
                        invoiceId: bill.id,
                        payment:
                          Number(bill.totalInr) > 0
                            ? {
                                method,
                                amountInr: Number(bill.totalInr),
                                reference: reference || undefined,
                              }
                            : undefined,
                        finalNotes: notes || undefined,
                        returnedPartLineIds: returned,
                        closeChecklist: job.skippedSteps.length
                          ? checks
                          : undefined,
                      },
                    })
                  }
                >
                  Record full payment and close
                </button>
              </fieldset>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function InvoiceTotals({
  value,
}: {
  value: Pick<Bill, "subtotalInr" | "taxInr" | "totalInr">;
}) {
  return (
    <dl className="invoice-totals">
      <div>
        <dt>Subtotal</dt>
        <dd>{money(Number(value.subtotalInr))}</dd>
      </div>
      <div>
        <dt>Tax</dt>
        <dd>{money(Number(value.taxInr))}</dd>
      </div>
      <div className="invoice-total">
        <dt>Total</dt>
        <dd>{money(Number(value.totalInr))}</dd>
      </div>
    </dl>
  );
}
