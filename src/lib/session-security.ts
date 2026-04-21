import { randomUUID } from "crypto";

export const ACTIVE_SESSION_COOKIE = "pv_active_session";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

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

export function isSupabaseAuthCookieName(name: string) {
  return /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i.test(String(name ?? ""));
}

export function hasSupabaseAuthCookie(
  input: Array<{ name?: string | null }> | ReadonlyArray<{ name?: string | null }>,
) {
  return input.some((item) => isSupabaseAuthCookieName(String(item.name ?? "")));
}
