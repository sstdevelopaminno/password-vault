import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/app-version";
import { RUNTIME_SCHEMA_VERSION } from "@/lib/pwa-runtime";
import { getRuntimeBuildMarker } from "@/lib/runtime-build";

export const dynamic = "force-dynamic";

type RuntimeDiagnosticPayload = {
  event?: string;
  mode?: string;
  marker?: string;
  schemaVersion?: string;
  page?: string;
  visibilityState?: string;
  installPromptAvailable?: boolean;
  note?: string;
  displayStandalone?: boolean;
  isAndroid?: boolean;
  isIos?: boolean;
  serviceWorkerSupported?: boolean;
  notificationsSupported?: boolean;
  pushManagerSupported?: boolean;
  badgingSupported?: boolean;
};

function sanitizeString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 200);
}

function sanitizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function safeBody(input: unknown): RuntimeDiagnosticPayload {
  if (!input || typeof input !== "object") return {};

  const body = input as Record<string, unknown>;
  return {
    event: sanitizeString(body.event),
    mode: sanitizeString(body.mode),
    marker: sanitizeString(body.marker),
    schemaVersion: sanitizeString(body.schemaVersion),
    page: sanitizeString(body.page),
    visibilityState: sanitizeString(body.visibilityState),
    installPromptAvailable: sanitizeBoolean(body.installPromptAvailable),
    note: sanitizeString(body.note),
    displayStandalone: sanitizeBoolean(body.displayStandalone),
    isAndroid: sanitizeBoolean(body.isAndroid),
    isIos: sanitizeBoolean(body.isIos),
    serviceWorkerSupported: sanitizeBoolean(body.serviceWorkerSupported),
    notificationsSupported: sanitizeBoolean(body.notificationsSupported),
    pushManagerSupported: sanitizeBoolean(body.pushManagerSupported),
    badgingSupported: sanitizeBoolean(body.badgingSupported),
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    appVersion: APP_VERSION,
    marker: getRuntimeBuildMarker(),
    schemaVersion: RUNTIME_SCHEMA_VERSION,
  });
}

export async function POST(request: Request) {
  const raw = await request.json().catch(function () {
    return {};
  });
  const body = safeBody(raw);
  const serverMarker = getRuntimeBuildMarker();
  const receivedAt = new Date().toISOString();

  const payload = {
    event: body.event ?? "runtime_event",
    mode: body.mode,
    marker: body.marker,
    schemaVersion: body.schemaVersion,
    page: body.page,
    visibilityState: body.visibilityState,
    installPromptAvailable: body.installPromptAvailable,
    note: body.note,
    displayStandalone: body.displayStandalone,
    isAndroid: body.isAndroid,
    isIos: body.isIos,
    serviceWorkerSupported: body.serviceWorkerSupported,
    notificationsSupported: body.notificationsSupported,
    pushManagerSupported: body.pushManagerSupported,
    badgingSupported: body.badgingSupported,
    appVersion: APP_VERSION,
    serverMarker: serverMarker,
    serverSchemaVersion: RUNTIME_SCHEMA_VERSION,
    receivedAt: receivedAt,
  };

  console.info("[runtime-diagnostics]", JSON.stringify(payload));

  return NextResponse.json({
    ok: true,
    appVersion: APP_VERSION,
    marker: serverMarker,
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    receivedAt: receivedAt,
  });
}
