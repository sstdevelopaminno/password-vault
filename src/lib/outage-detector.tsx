"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { postRuntimeDiagnostic } from "@/lib/runtime-diagnostics";

type OutageState = {
  online: boolean;
  apiReachable: boolean;
  lastCheckedAt?: string;
  reason?: "offline" | "api";
};

type AutoSyncState = {
  syncing: boolean;
  lastSyncedAt?: string;
  processed?: number;
  failed?: number;
};

type OutageContextValue = OutageState & {
  isOfflineMode: boolean;
  autoSync: AutoSyncState;
};

const OutageContext = createContext<OutageContextValue | null>(null);

const HEALTH_ENDPOINT = "/api/runtime/diagnostics";
const HEALTH_TIMEOUT_MS = 6000;
const HEALTH_INTERVAL_MS = 15000;

async function checkApiHealth(signal: AbortSignal) {
  const res = await fetch(HEALTH_ENDPOINT, { method: "GET", cache: "no-store", signal });
  return res.ok;
}

export function OutageProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OutageState>({
    online: true,
    apiReachable: true,
  });
  const [autoSync, setAutoSync] = useState<AutoSyncState>({ syncing: false });
  const lastReportedRef = useRef<string | null>(null);
  const wasOfflineRef = useRef(false);

  useEffect(function () {
    if (typeof window === "undefined") return;
    let alive = true;

    function emitDiagnostic(next: OutageState) {
      const marker = [
        next.online ? "online" : "offline",
        next.apiReachable ? "api-ok" : "api-down",
      ].join("|");
      if (lastReportedRef.current === marker) return;
      lastReportedRef.current = marker;
      postRuntimeDiagnostic({
        event: "outage_state",
        note: marker,
      });
    }

    async function runCheck() {
      if (!alive) return;
      const online = navigator.onLine;
      if (!online) {
        const next = {
          online: false,
          apiReachable: false,
          reason: "offline" as const,
          lastCheckedAt: new Date().toISOString(),
        };
        setState(next);
        emitDiagnostic(next);
        return;
      }

      const controller = new AbortController();
      const timer = window.setTimeout(function () {
        controller.abort();
      }, HEALTH_TIMEOUT_MS);

      let apiReachable = false;
      try {
        apiReachable = await checkApiHealth(controller.signal);
      } catch {
        apiReachable = false;
      } finally {
        window.clearTimeout(timer);
      }

      const next = {
        online: true,
        apiReachable: apiReachable,
        reason: apiReachable ? undefined : ("api" as const),
        lastCheckedAt: new Date().toISOString(),
      };
      if (wasOfflineRef.current && online && apiReachable) {
        setAutoSync(function (prev) {
          return { ...prev, syncing: true };
        });
        void import("@/lib/offline-sync")
          .then(function (mod) {
            return mod.flushOfflineQueue();
          })
          .then(function (result) {
            setAutoSync({
              syncing: false,
              lastSyncedAt: new Date().toISOString(),
              processed: result.processed,
              failed: result.failed,
            });
          })
          .catch(function () {
            setAutoSync({
              syncing: false,
              lastSyncedAt: new Date().toISOString(),
              processed: 0,
              failed: 1,
            });
          });
      }
      wasOfflineRef.current = !online || !apiReachable;
      setState(next);
      emitDiagnostic(next);
    }

    runCheck();
    const interval = window.setInterval(runCheck, HEALTH_INTERVAL_MS);
    window.addEventListener("online", runCheck);
    window.addEventListener("offline", runCheck);

    return function () {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("online", runCheck);
      window.removeEventListener("offline", runCheck);
    };
  }, []);

  const value = useMemo<OutageContextValue>(() => {
    return {
      ...state,
      isOfflineMode: !state.online || !state.apiReachable,
      autoSync: autoSync,
    };
  }, [autoSync, state]);

  return <OutageContext.Provider value={value}>{children}</OutageContext.Provider>;
}

export function useOutageState() {
  const ctx = useContext(OutageContext);
  if (!ctx) {
    return {
      online: true,
      apiReachable: true,
      isOfflineMode: false,
      autoSync: { syncing: false },
    };
  }
  return ctx;
}
