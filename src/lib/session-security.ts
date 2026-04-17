import { randomUUID } from "crypto";

export const ACTIVE_SESSION_COOKIE = "pv_active_session";
export const FACE_PIN_SESSION_COOKIE = "pv_face_pin_session";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days
export const FACE_PIN_SESSION_TTL_SEC = 60 * 60 * 12; // 12h

export function isSecureCookie() {
  return process.env.NODE_ENV === "production";
}

export function getSharedCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: isSecureCookie(),
    maxAge: AUTH_COOKIE_MAX_AGE,
  };
}

export function createActiveSessionToken() {
  return Date.now().toString(36) + "." + randomUUID();
}
