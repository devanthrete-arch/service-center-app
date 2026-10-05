import { getAccessToken, signOut } from './session';

const API_URL = import.meta.env.VITE_AUTOFLEX_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
  } catch {
    /* ignore */
  }
  return res.statusText || 'Request failed';
}

export async function autoflex<T>(
  path: string,
  init: RequestInit = {},
  auth = false,
): Promise<T> {
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
    throw new ApiError(res.status, await parseError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export async function devStaffSession(persona: string): Promise<string> {
  const session = await autoflex<{ accessToken: string }>('/v1/dev/session', {
    method: 'POST',
    body: JSON.stringify({ persona }),
  });
  return session.accessToken;
}
