export const SCREEN_LOCK_SETTINGS_KEY = "pv_screen_lock_settings_v1";
export const SCREEN_LOCK_SETTINGS_UPDATED_EVENT = "pv:screen-lock-settings-updated";

export type ScreenLockSettings = {
  enabled: boolean;
  timeoutSec: number;
};

export const SCREEN_LOCK_TIMEOUT_OPTIONS_SEC = [5, 10, 15, 20, 30, 60, 120, 180, 300, 600, 900] as const;

export const DEFAULT_SCREEN_LOCK_SETTINGS: ScreenLockSettings = {
  enabled: false,
  timeoutSec: 60,
};

export function clampScreenLockTimeoutSec(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SCREEN_LOCK_SETTINGS.timeoutSec;

  const rounded = Math.floor(parsed);
  const min = SCREEN_LOCK_TIMEOUT_OPTIONS_SEC[0];
  const max = SCREEN_LOCK_TIMEOUT_OPTIONS_SEC[SCREEN_LOCK_TIMEOUT_OPTIONS_SEC.length - 1];
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

export function normalizeScreenLockSettings(input: unknown): ScreenLockSettings {
  const source = (input ?? {}) as Partial<ScreenLockSettings>;
  return {
    enabled: Boolean(source.enabled),
    timeoutSec: clampScreenLockTimeoutSec(source.timeoutSec),
  };
}
