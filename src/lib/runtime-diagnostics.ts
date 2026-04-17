import { RUNTIME_DIAGNOSTICS_ENDPOINT, type RuntimeCapabilities } from "@/lib/pwa-runtime";

export type RuntimeDiagnosticInput = {
  event: string;
  marker?: string;
  schemaVersion?: string;
  page?: string;
  visibilityState?: string;
  installPromptAvailable?: boolean;
  note?: string;
  capabilities?: RuntimeCapabilities;
};

export async function postRuntimeDiagnostic(input: RuntimeDiagnosticInput) {
  if (typeof window === "undefined") return;

  try {
    await fetch(RUNTIME_DIAGNOSTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event: input.event,
        marker: input.marker,
        schemaVersion: input.schemaVersion,
        page: input.page ?? window.location.pathname,
        visibilityState: input.visibilityState ?? document.visibilityState,
        installPromptAvailable: input.installPromptAvailable,
        note: input.note,
        mode: input.capabilities?.mode,
        displayStandalone: input.capabilities?.displayStandalone,
        isAndroid: input.capabilities?.isAndroid,
        isIos: input.capabilities?.isIos,
        isCapacitorNative: input.capabilities?.isCapacitorNative,
        androidMajorVersion: input.capabilities?.androidMajorVersion,
        iosMajorVersion: input.capabilities?.iosMajorVersion,
        iosMinorVersion: input.capabilities?.iosMinorVersion,
        android14OrNewer: input.capabilities?.android14OrNewer,
        iosHomeScreenPushSupported: input.capabilities?.iosHomeScreenPushSupported,
        iosHomeScreenPushReady: input.capabilities?.iosHomeScreenPushReady,
        serviceWorkerSupported: input.capabilities?.serviceWorkerSupported,
        notificationsSupported: input.capabilities?.notificationsSupported,
        pushManagerSupported: input.capabilities?.pushManagerSupported,
        badgingSupported: input.capabilities?.badgingSupported,
      }),
    });
  } catch {
    // ignore diagnostics failures
  }
}
