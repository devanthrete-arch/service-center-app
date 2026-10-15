import { getAccessToken, signOut } from './session';
import type { JobStatus } from '../domain/types';

const API_URL = import.meta.env.VITE_AUTOFLEX_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  constructor(status: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const message = Array.isArray(body.message)
      ? body.message.filter((item): item is string => typeof item === 'string').join(', ')
      : typeof body.message === 'string'
        ? body.message
        : res.statusText;
    const active = body.activeJob;
    let details: Record<string, unknown> | undefined;
    if (active && typeof active === 'object' && !Array.isArray(active)) {
      const job = active as Record<string, unknown>;
      if (
        typeof job.id === 'string' &&
        /^[a-f0-9-]{36}$/i.test(job.id) &&
        (job.jobNumber === null ||
          (typeof job.jobNumber === 'string' && job.jobNumber.length <= 128)) &&
        typeof job.status === 'string' &&
        [
          'CHECKED_IN',
          'INSPECTION',
          'AWAITING_APPROVAL',
          'IN_PROGRESS',
          'ON_HOLD',
          'QUALITY_CHECK',
          'READY_FOR_PICKUP',
          'COMPLETED',
          'CANCELLED',
        ].includes(job.status)
      )
        details = {
          activeJob: { id: job.id, jobNumber: job.jobNumber, status: job.status as JobStatus },
        };
    }
    return new ApiError(
      res.status,
      message || 'Request failed',
      typeof body.code === 'string' && /^[A-Z_]{1,80}$/.test(body.code) ? body.code : undefined,
      details,
    );
  } catch {
    /* ignore */
  }
  return new ApiError(res.status, res.statusText || 'Request failed');
}

export async function autoflex<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (auth) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Autoflex is unreachable. Start the backend and try again.');
  }
  if (!res.ok) {
    if (auth && res.status === 401) signOut();
    throw await parseError(res);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export async function devStaffSession(phone: string): Promise<string> {
  const session = await autoflex<{ accessToken: string }>('/v1/dev/session', {
    method: 'POST',
    body: JSON.stringify({ phone, actor: 'staff' }),
  });
  return session.accessToken;
}
