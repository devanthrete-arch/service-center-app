export const BILLING_ATTEMPT_PREFIX = "af-sc:billing:";
export type BillingAttempt = {
  kind: "issue" | "close" | "cancel";
  invoiceId?: string;
  key: string;
  version: number;
  body: Record<string, unknown>;
};
export function loadBillingAttempt(key: string): BillingAttempt | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 100000) return null;
    const value = JSON.parse(raw) as BillingAttempt;
    return value &&
      ["issue", "close", "cancel"].includes(value.kind) &&
      (value.kind !== "cancel" || (typeof value.invoiceId === "string" && /^[a-f0-9-]{36}$/i.test(value.invoiceId))) &&
      /^[a-zA-Z0-9_.:-]{8,128}$/.test(value.key) &&
      Number.isSafeInteger(value.version) &&
      value.version > 0 &&
      value.body &&
      typeof value.body === "object" &&
      !Array.isArray(value.body)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function clearBillingAttempts() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(BILLING_ATTEMPT_PREFIX))
        sessionStorage.removeItem(key);
  } catch {
    /* Storage can be disabled. */
  }
}
