'use client';

import { getTerminalDashboardUrl } from '@/lib/terminal/ticket-terminal-client';

// Silent re-launch: when the terminal has no usable session (new tab, expired
// session, spent launch link) it bounces to the dashboard's /terminal-launch
// route. The dashboard is already logged in, issues a fresh one-time launch
// code for the account and sends the browser straight back here.

const LAST_LOGIN_STORAGE_KEY = 'yopips-terminal-last-login';
const RELAUNCH_ATTEMPT_STORAGE_KEY = 'yopips-terminal-relaunch-at';
// A relaunch that comes back without a working session within this window is
// treated as failed, so the terminal shows the "session ended" screen instead
// of bouncing between the two apps forever.
const RELAUNCH_LOOP_GUARD_MS = 60_000;

const normalizeLogin = (login: unknown): string | null => {
  const value = String(login ?? '').trim().replace(/^mt5-/i, '');
  return /^\d+$/.test(value) && Number(value) > 0 ? value : null;
};

const readStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string | null): void => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: relaunch falls back to the dashboard home.
  }
};

// Called after every successful exchange/resume: remembers the account for the
// next relaunch (an MT5 login is not a secret) and re-arms the loop guard.
export const rememberTerminalLaunchSuccess = (login: unknown): void => {
  if (typeof window === 'undefined') return;
  const normalized = normalizeLogin(login);
  if (normalized) writeStorage(LAST_LOGIN_STORAGE_KEY, normalized);
  writeStorage(RELAUNCH_ATTEMPT_STORAGE_KEY, null);
};

// Returns true when the browser is being redirected to the dashboard; false when
// relaunch is unavailable (no dashboard URL) or was just attempted and failed.
export const relaunchTerminalFromDashboard = (preferredLogin?: unknown): boolean => {
  if (typeof window === 'undefined') return false;
  const dashboardUrl = getTerminalDashboardUrl();
  if (!dashboardUrl) return false;

  const lastAttemptAt = Number(readStorage(RELAUNCH_ATTEMPT_STORAGE_KEY));
  if (Number.isFinite(lastAttemptAt) && Date.now() - lastAttemptAt < RELAUNCH_LOOP_GUARD_MS) {
    return false;
  }
  writeStorage(RELAUNCH_ATTEMPT_STORAGE_KEY, String(Date.now()));

  const login = normalizeLogin(preferredLogin) ?? normalizeLogin(readStorage(LAST_LOGIN_STORAGE_KEY));
  const target = new URL('/terminal-launch', `${dashboardUrl}/`);
  if (login) target.searchParams.set('login', login);
  window.location.replace(target.toString());
  return true;
};
