export const REASONS = {
  SHARED_INCORRECTLY: "Shared with the wrong person",
  LINK_EXPOSED: "Link exposed or shared publicly",
  CUSTOMER_REQUEST: "Customer requested a new link",
  OTHER: "Other reason",
} as const;
export type Reason = keyof typeof REASONS;
export type Attempt = {
  schema: 1;
  key: string;
  version: number;
  reason: Reason;
};
export const ATTEMPT_PREFIX = "af-sc:tracking-attempt:";
export function trackingUrl(
  token: string,
  configured = import.meta.env.VITE_CUSTOMER_WEB_URL,
): string {
  const value =
    configured || (import.meta.env.DEV ? "http://localhost:5173" : "");
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw new Error(
      "Configure a valid customer website origin to share links.",
    );
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(token))
    throw new Error("Invalid tracking token response.");
  return new URL(`/t/${encodeURIComponent(token)}`, url).href;
}
export function pendingAttempt(value: string | null): Attempt | null {
  try {
    const row = JSON.parse(value || "null") as Attempt | null;
    return row &&
      row.schema === 1 &&
      /^[A-Za-z0-9_.:-]{8,128}$/.test(row.key) &&
      Number.isInteger(row.version) &&
      row.version > 0 &&
      row.version <= 2147483647 &&
      Object.hasOwn(REASONS, row.reason)
      ? row
      : null;
  } catch {
    return null;
  }
}
export function clearTrackingAttempts() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(ATTEMPT_PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* storage may be unavailable */
  }
}
