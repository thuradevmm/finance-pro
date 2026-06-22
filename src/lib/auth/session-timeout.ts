const configuredTimeoutMinutes = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MINUTES ?? "30");

export const SESSION_ACTIVITY_STORAGE_KEY = "finance-pro:last-session-activity";
export const SESSION_IDLE_TIMEOUT_MS =
  (Number.isFinite(configuredTimeoutMinutes) && configuredTimeoutMinutes > 0 ? configuredTimeoutMinutes : 30) * 60_000;

export function clearSessionActivity() {
  window.localStorage.removeItem(SESSION_ACTIVITY_STORAGE_KEY);
}

export function getLastSessionActivity() {
  const value = Number(window.localStorage.getItem(SESSION_ACTIVITY_STORAGE_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function markSessionActivity(timestamp = Date.now()) {
  window.localStorage.setItem(SESSION_ACTIVITY_STORAGE_KEY, String(timestamp));
}
