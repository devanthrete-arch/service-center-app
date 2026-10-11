import { clearMenuAttempts } from './service-menu';
import { clearTrackingAttempts } from './tracking-link';
const TOKEN_KEY = 'af_sc_access_token';
export const SIGNED_OUT_EVENT = 'af-sc:signed-out';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  if (getAccessToken() !== token) {
    clearTrackingAttempts();
    clearMenuAttempts();
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  clearTrackingAttempts();
  clearMenuAttempts();
  localStorage.removeItem(TOKEN_KEY);
}

export function signOut(): void {
  clearAccessToken();
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
}
