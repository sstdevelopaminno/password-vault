type ReminderState = {
  date: string;
  count: number;
  lastShownAt: number;
};

type ConsumeReminderOptions = {
  storageKey: string;
  maxPerDay?: number;
  minIntervalMs?: number;
  nowMs?: number;
};

function getLocalDateStamp(nowMs: number) {
  const date = new Date(nowMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readState(storageKey: string): ReminderState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReminderState>;
    const date = String(parsed.date ?? "");
    const count = Number(parsed.count ?? 0);
    const lastShownAt = Number(parsed.lastShownAt ?? 0);
    return {
      date,
      count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
      lastShownAt: Number.isFinite(lastShownAt) && lastShownAt > 0 ? Math.floor(lastShownAt) : 0,
    };
  } catch {
    return null;
  }
}

function writeState(storageKey: string, state: ReminderState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
}

export function consumeReminderQuota(options: ConsumeReminderOptions) {
  if (typeof window === "undefined") return false;

  const maxPerDay = Math.max(1, Math.floor(options.maxPerDay ?? 2));
  const minIntervalMs = Math.max(0, Math.floor(options.minIntervalMs ?? 0));
  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  const today = getLocalDateStamp(nowMs);
  const previous = readState(options.storageKey);

  const current: ReminderState =
    previous && previous.date === today
      ? previous
      : { date: today, count: 0, lastShownAt: 0 };

  if (current.count >= maxPerDay) {
    writeState(options.storageKey, current);
    return false;
  }

  if (current.lastShownAt > 0 && nowMs - current.lastShownAt < minIntervalMs) {
    writeState(options.storageKey, current);
    return false;
  }

  const nextState: ReminderState = {
    date: today,
    count: current.count + 1,
    lastShownAt: nowMs,
  };
  writeState(options.storageKey, nextState);
  return true;
}
