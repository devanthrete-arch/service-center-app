import { clearScheduleAttempts } from './booking-schedule';
import { clearMenuAttempts } from './service-menu';
import { clearTrackingAttempts } from './tracking-link';
import { clearWalkInAttempts } from './walk-in';
import { clearBillingAttempts } from './billing';
const TOKEN_KEY = 'af_sc_access_token';
export const SIGNED_OUT_EVENT = 'af-sc:signed-out';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  if (getAccessToken() !== token) {
    clearRegistrationRecovery();
    clearBillingAttempts();
    clearTrackingAttempts();
    clearMenuAttempts();
    clearScheduleAttempts();
    clearWalkInAttempts();
  }
  localStorage.setItem(TOKEN_KEY, token);
}

function clearRegistrationRecovery() {
  try {for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith('af-sc:registration:'))sessionStorage.removeItem(key);}} catch {/* Sign-out must still clear the authentication token. */}
}
export function clearAccessToken(): void {
  clearRegistrationRecovery();
  clearBillingAttempts();
  clearTrackingAttempts();
  clearMenuAttempts();
  clearScheduleAttempts();
  clearWalkInAttempts();
  localStorage.removeItem(TOKEN_KEY);
}

export function signOut(): void {
  clearAccessToken();
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
}
