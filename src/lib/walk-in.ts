import { autoflex } from './api';
import type {
  CreatedJob,
  IntakeCustomer,
  IntakeVehicle,
  IntakeVehiclePage,
  WalkInInput,
} from '../domain/types';

const PREFIX = 'af-sc:walk-in-attempt:';
const BODY_TTL = 30 * 60_000;
const MAX_BODY = 16_000;
const memory = new Map<string, WalkInAttempt>();
export type WalkInAttempt = {
  schema: 1;
  kind: 'WALK_IN';
  key: string;
  requestHash: string;
  createdAt: number;
  bodyText: string | null;
};
export const walkInKey = (staff: string, center: string) => `${PREFIX}${staff}:${center}`;

export function clearWalkInAttempts() {
  memory.clear();
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* In-memory cleanup still works when storage is unavailable. */
  }
}

export function retainWalkInIdentity(key: string) {
  for (const stored of memory.keys()) if (stored !== key) memory.delete(stored);
  try {
    Object.keys(sessionStorage)
      .filter((stored) => stored.startsWith(PREFIX) && stored !== key)
      .forEach((stored) => sessionStorage.removeItem(stored));
  } catch {
    /* No persistent storage is required for cleanup in this tab. */
  }
}

export function saveWalkInAttempt(storageKey: string, attempt: WalkInAttempt): boolean {
  memory.set(storageKey, attempt);
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(attempt));
    return true;
  } catch {
    return false;
  }
}

export function removeWalkInAttempt(storageKey: string) {
  memory.delete(storageKey);
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* Nothing persisted. */
  }
}

export function readWalkInAttempt(storageKey: string): WalkInAttempt | null {
  let value: unknown;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw && raw.length <= MAX_BODY + 1000) value = JSON.parse(raw);
    else value = memory.get(storageKey);
  } catch {
    value = memory.get(storageKey);
  }
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<WalkInAttempt>;
  if (
    row.schema !== 1 ||
    row.kind !== 'WALK_IN' ||
    typeof row.key !== 'string' ||
    !/^[A-Za-z0-9_.:-]{8,128}$/.test(row.key) ||
    typeof row.requestHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(row.requestHash) ||
    typeof row.createdAt !== 'number' ||
    !Number.isSafeInteger(row.createdAt) ||
    row.createdAt <= 0 ||
    row.createdAt > Date.now() + 60_000 ||
    !(
      row.bodyText === null ||
      (typeof row.bodyText === 'string' && row.bodyText.length <= MAX_BODY)
    )
  ) {
    removeWalkInAttempt(storageKey);
    return null;
  }
  let attempt = row as WalkInAttempt;
  if (attempt.bodyText !== null) {
    try {
      const body = JSON.parse(attempt.bodyText) as Record<string, unknown>;
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        typeof body.customerId !== 'string' ||
        !Number.isInteger(body.customerRevision)
      )
        throw new Error('Malformed draft');
    } catch {
      // An invalid personal draft cannot be retried; its result handle remains usable.
      attempt = { ...attempt, bodyText: null };
    }
    if (Date.now() - attempt.createdAt >= BODY_TTL) attempt = { ...attempt, bodyText: null };
  }
  saveWalkInAttempt(storageKey, attempt);
  return attempt;
}

export function normalizeIndiaPhone(raw: string): string | null {
  if (!/^\+?[\d\s-]+$/.test(raw.trim())) return null;
  const digits = raw.replace(/[\s-]/g, '');
  const national = digits.startsWith('+91')
    ? digits.slice(3)
    : /^91\d{10}$/.test(digits)
      ? digits.slice(2)
      : digits;
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
}

export function normalizePlate(raw: string): string | null {
  const value = raw.trim().replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{4,32}$/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) ? value : null;
}

export async function walkInRequestHash(bodyText: string): Promise<string> {
  const body = JSON.parse(bodyText) as unknown;
  const bytes = new TextEncoder().encode(`POST /v1/jobs ${JSON.stringify(body)}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function prepareWalkInAttempt(body: WalkInInput): Promise<WalkInAttempt> {
  const bodyText = JSON.stringify(body);
  if (bodyText.length > MAX_BODY) throw new Error('The intake details are too long.');
  return {
    schema: 1,
    kind: 'WALK_IN',
    key: crypto.randomUUID(),
    requestHash: await walkInRequestHash(bodyText),
    createdAt: Date.now(),
    bodyText,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const outer = init.signal;
  const abort = () => controller.abort();
  outer?.addEventListener('abort', abort, { once: true });
  if (outer?.aborted) controller.abort();
  const timer = window.setTimeout(abort, 15_000);
  try {
    return await autoflex<T>(path, { ...init, signal: controller.signal }, true);
  } finally {
    window.clearTimeout(timer);
    outer?.removeEventListener('abort', abort);
  }
}

export const walkInApi = {
  customer: (phone: string, signal?: AbortSignal) =>
    request<{ status: 'FOUND'; customer: IntakeCustomer } | { status: 'NOT_FOUND' }>(
      '/v1/center/customers/lookup',
      {
        method: 'POST',
        body: JSON.stringify({ phone }),
        signal,
      },
    ),
  vehicles: (customerId: string, cursor?: string, signal?: AbortSignal) =>
    request<IntakeVehiclePage>(
      `/v1/center/customers/${encodeURIComponent(customerId)}/vehicles?limit=20${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`,
      { signal },
    ),
  vehicle: (customerId: string, registrationNumber: string, signal?: AbortSignal) =>
    request<
      | { status: 'FOUND'; vehicle: IntakeVehicle; customerRevision: number }
      | {
          status: 'NOT_FOUND';
          registrationNumber: string;
          customerRevision: number;
        }
    >(`/v1/center/customers/${encodeURIComponent(customerId)}/vehicle-lookup`, {
      method: 'POST',
      body: JSON.stringify({ registrationNumber }),
      signal,
    }),
  status: (attempt: WalkInAttempt, signal?: AbortSignal) =>
    request<{ status: 'CREATED'; job: CreatedJob } | { status: 'UNRESOLVED' }>(
      '/v1/center/walk-ins/attempt-status',
      {
        method: 'POST',
        signal,
        body: JSON.stringify({
          idempotencyKey: attempt.key,
          requestHash: attempt.requestHash,
        }),
      },
    ),
  send: async (attempt: WalkInAttempt): Promise<CreatedJob> => {
    if (!attempt.bodyText || Date.now() - attempt.createdAt >= BODY_TTL)
      throw new Error('Personal intake details have expired. Check the creation result instead.');
    if ((await walkInRequestHash(attempt.bodyText)) !== attempt.requestHash)
      throw new Error('The saved intake details changed. Check the creation result instead.');
    return request<CreatedJob>('/v1/jobs', {
      method: 'POST',
      body: attempt.bodyText,
      headers: { 'Idempotency-Key': attempt.key },
    });
  },
};
