'use client';

import { createElement, useEffect, type ReactNode } from 'react';
import { HeadsUpNotificationProvider } from '@/components/notifications/heads-up-provider';
import { ToastProvider } from '@/components/ui/toast';
import { I18nProvider } from '@/i18n/provider';
import { OutageProvider } from '@/lib/outage-detector';
import {
  RUNTIME_BUILD_MARKER_STORAGE_KEY,
  RUNTIME_LOCAL_STORAGE_KEYS_TO_RESET,
  RUNTIME_SCHEMA_STORAGE_KEY,
  RUNTIME_SCHEMA_VERSION,
  RUNTIME_UPDATE_NOTICE_STORAGE_KEY,
  isManagedRuntimeCacheName,
} from '@/lib/pwa-runtime';
import { postRuntimeDiagnostic } from '@/lib/runtime-diagnostics';

type ProvidersProps = {
  children?: ReactNode;
  runtimeBuildMarker: string;
};

const NIGHTLY_MAINTENANCE_KEY = 'pv_nightly_maintenance_2330_0100';
const NIGHTLY_RELOAD_KEY = 'pv_nightly_maintenance_reload_2330_0100';
const MAINTENANCE_START_MINUTES = 23 * 60 + 30;
const MAINTENANCE_END_MINUTES = 60;
const MAINTENANCE_CHECK_INTERVAL_MS = 60_000;
const RUNTIME_VERSION_ENDPOINT = '/api/version';
const RUNTIME_RECONCILE_INTERVAL_MS = 90_000;
const VERSION_FETCH_TIMEOUT_MS = 7000;
const RUNTIME_AUTO_RELOAD_KEY_PREFIX = 'pv_runtime_autoreload_';

type RuntimeVersionSnapshot = {
  marker: string;
  schemaVersion: string;
};

function toDateStamp(input: Date) {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, '0');
  const day = String(input.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isInNightlyMaintenanceWindow(now: Date) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= MAINTENANCE_START_MINUTES || minutes < MAINTENANCE_END_MINUTES;
}

function getNightlyWindowId(now: Date) {
  const base = new Date(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < MAINTENANCE_END_MINUTES) {
    base.setDate(base.getDate() - 1);
  }
  return `${toDateStamp(base)}-2330-0100`;
}

function minutesUntilNextWindowBoundary(now: Date) {
  const start = new Date(now);
  start.setHours(23, 30, 0, 0);
  if (start <= now) {
    start.setDate(start.getDate() + 1);
  }

  const end = new Date(now);
  end.setHours(1, 0, 0, 0);
  if (end <= now) {
    end.setDate(end.getDate() + 1);
  }

  const nextBoundary = start < end ? start : end;
  return Math.max(10_000, nextBoundary.getTime() - now.getTime() + 500);
}

async function postCachePurgeToServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = registration?.active ?? registration?.waiting ?? registration?.installing ?? navigator.serviceWorker.controller ?? null;
    worker?.postMessage({ type: 'PURGE_APP_CACHE' });
  } catch {
    // ignore worker message failures
  }
}

async function clearManagedCaches() {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return 0;
  }

  try {
    const names = await caches.keys();
    const managed = names.filter(function (name) {
      return isManagedRuntimeCacheName(name);
    });
    if (!managed.length) return 0;
    await Promise.all(
      managed.map(function (name) {
        return caches.delete(name);
      }),
    );
    return managed.length;
  } catch {
    return 0;
  }
}

async function fetchRuntimeVersionSnapshot(fallbackMarker: string): Promise<RuntimeVersionSnapshot> {
  if (typeof window === 'undefined') {
    return { marker: fallbackMarker, schemaVersion: RUNTIME_SCHEMA_VERSION };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(function () {
    controller.abort();
  }, VERSION_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(RUNTIME_VERSION_ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    const body = (await response.json().catch(function () {
      return {};
    })) as {
      marker?: unknown;
      schemaVersion?: unknown;
    };

    const markerRaw = typeof body.marker === 'string' ? body.marker.trim() : '';
    const schemaRaw = typeof body.schemaVersion === 'string' ? body.schemaVersion.trim() : '';

    return {
      marker: markerRaw || fallbackMarker,
      schemaVersion: schemaRaw || RUNTIME_SCHEMA_VERSION,
    };
  } catch {
    return { marker: fallbackMarker, schemaVersion: RUNTIME_SCHEMA_VERSION };
  } finally {
    window.clearTimeout(timer);
  }
}

async function waitForControllerChange(timeoutMs: number) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  await new Promise<void>(function (resolve) {
    let finished = false;
    const timer = window.setTimeout(function () {
      if (finished) return;
      finished = true;
      resolve();
    }, timeoutMs);

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function Providers(props: ProvidersProps) {
  useEffect(function () {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const swUrl = '/sw.js?build=' + encodeURIComponent(props.runtimeBuildMarker);
    navigator.serviceWorker.register(swUrl, { scope: '/' }).catch(function () {
      // ignore register failure in dev
    });
  }, [props.runtimeBuildMarker]);

  useEffect(function () {
    if (typeof window === 'undefined') return;

    let disposed = false;
    let intervalId = 0;

    const reconcileRuntimeVersion = async function (trigger: string) {
      if (disposed) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      const server = await fetchRuntimeVersionSnapshot(props.runtimeBuildMarker);
      if (disposed) return;

      const localMarker = window.localStorage.getItem(RUNTIME_BUILD_MARKER_STORAGE_KEY);
      const localSchemaVersion = window.localStorage.getItem(RUNTIME_SCHEMA_STORAGE_KEY);

      if (!localMarker || !localSchemaVersion) {
        window.localStorage.setItem(RUNTIME_BUILD_MARKER_STORAGE_KEY, server.marker);
        window.localStorage.setItem(RUNTIME_SCHEMA_STORAGE_KEY, server.schemaVersion);
        return;
      }

      if (localMarker === server.marker && localSchemaVersion === server.schemaVersion) {
        return;
      }

      const reloadKey = `${RUNTIME_AUTO_RELOAD_KEY_PREFIX}${server.marker}:${server.schemaVersion}`;
      if (window.sessionStorage.getItem(reloadKey) === '1') {
        return;
      }

      void postRuntimeDiagnostic({
        event: 'runtime_outdated_detected',
        marker: server.marker,
        schemaVersion: server.schemaVersion,
        note: `${trigger};from:${localMarker}/${localSchemaVersion};to:${server.marker}/${server.schemaVersion}`,
      });

      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            await registration.update().catch(function () {
              // ignore update polling failures
            });

            if (registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
              await waitForControllerChange(3500);
            }
          }
        } catch {
          // ignore registration failures
        }
      }

      await postCachePurgeToServiceWorker();
      await clearManagedCaches();

      try {
        window.localStorage.setItem(RUNTIME_BUILD_MARKER_STORAGE_KEY, server.marker);
        window.localStorage.setItem(RUNTIME_SCHEMA_STORAGE_KEY, server.schemaVersion);
        window.localStorage.removeItem(RUNTIME_UPDATE_NOTICE_STORAGE_KEY);
      } catch {
        // ignore storage failures
      }

      void postRuntimeDiagnostic({
        event: 'runtime_auto_refresh_reload',
        marker: server.marker,
        schemaVersion: server.schemaVersion,
        note: trigger,
      });

      window.sessionStorage.setItem(reloadKey, '1');
      window.location.reload();
    };

    const onVisibilityChange = function () {
      if (document.visibilityState !== 'visible') return;
      void reconcileRuntimeVersion('visibility');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void reconcileRuntimeVersion('boot');
    intervalId = window.setInterval(function () {
      void reconcileRuntimeVersion('interval');
    }, RUNTIME_RECONCILE_INTERVAL_MS);

    return function () {
      disposed = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [props.runtimeBuildMarker]);

  useEffect(function () {
    if (typeof window === 'undefined') return;

    let disposed = false;
    let intervalId = 0;
    let boundaryTimer = 0;

    const runNightlyMaintenance = async function () {
      if (disposed) return;

      const now = new Date();
      if (!isInNightlyMaintenanceWindow(now)) return;

      const windowId = getNightlyWindowId(now);
      if (window.localStorage.getItem(NIGHTLY_MAINTENANCE_KEY) === windowId) return;

      window.localStorage.setItem(NIGHTLY_MAINTENANCE_KEY, windowId);

      void postRuntimeDiagnostic({
        event: 'runtime_nightly_maintenance_start',
        marker: props.runtimeBuildMarker,
        schemaVersion: RUNTIME_SCHEMA_VERSION,
        note: `window:${windowId}`,
      });

      await postCachePurgeToServiceWorker();
      const purgedCount = await clearManagedCaches();

      try {
        for (const key of RUNTIME_LOCAL_STORAGE_KEYS_TO_RESET) {
          window.localStorage.removeItem(key);
        }
        window.localStorage.setItem(RUNTIME_BUILD_MARKER_STORAGE_KEY, props.runtimeBuildMarker);
        window.localStorage.setItem(RUNTIME_SCHEMA_STORAGE_KEY, RUNTIME_SCHEMA_VERSION);
      } catch {
        // ignore storage failures
      }

      void postRuntimeDiagnostic({
        event: 'runtime_nightly_maintenance_complete',
        marker: props.runtimeBuildMarker,
        schemaVersion: RUNTIME_SCHEMA_VERSION,
        note: `window:${windowId};purged:${String(purgedCount)}`,
      });

      const reloadedWindow = window.sessionStorage.getItem(NIGHTLY_RELOAD_KEY);
      if (reloadedWindow === windowId) return;

      window.sessionStorage.setItem(NIGHTLY_RELOAD_KEY, windowId);
      window.setTimeout(function () {
        if (disposed) return;
        window.location.reload();
      }, 650);
    };

    const scheduleBoundaryTick = function () {
      if (disposed) return;
      const delay = minutesUntilNextWindowBoundary(new Date());
      boundaryTimer = window.setTimeout(function () {
        if (disposed) return;
        void runNightlyMaintenance();
        scheduleBoundaryTick();
      }, delay);
    };

    void runNightlyMaintenance();

    intervalId = window.setInterval(function () {
      void runNightlyMaintenance();
    }, MAINTENANCE_CHECK_INTERVAL_MS);
    scheduleBoundaryTick();

    return function () {
      disposed = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      if (boundaryTimer) {
        window.clearTimeout(boundaryTimer);
      }
    };
  }, [props.runtimeBuildMarker]);

  return createElement(
    I18nProvider,
    null,
    createElement(
      ToastProvider,
      null,
      createElement(
        OutageProvider,
        null,
        createElement(HeadsUpNotificationProvider, null, props.children),
      ),
    ),
  );
}
