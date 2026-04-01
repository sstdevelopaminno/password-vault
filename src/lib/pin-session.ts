export const DEFAULT_PIN_SESSION_TIMEOUT_SEC = 90;
export const MIN_PIN_SESSION_TIMEOUT_SEC = 15;
export const MAX_PIN_SESSION_TIMEOUT_SEC = 3600;

export const PIN_SESSION_TIMEOUT_OPTIONS_SEC = [15, 30, 60, 120, 300, 600] as const;

export function clampPinSessionTimeoutSec(value: unknown, fallback = DEFAULT_PIN_SESSION_TIMEOUT_SEC) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < MIN_PIN_SESSION_TIMEOUT_SEC) return MIN_PIN_SESSION_TIMEOUT_SEC;
  if (rounded > MAX_PIN_SESSION_TIMEOUT_SEC) return MAX_PIN_SESSION_TIMEOUT_SEC;
  return rounded;
}
