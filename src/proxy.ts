import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  ACTIVE_SESSION_COOKIE,
  FACE_PIN_SESSION_COOKIE,
  getSharedCookieOptions,
  hasSupabaseAuthCookie,
  isSupabaseAuthCookieName,
} from "@/lib/session-security";
import {
  VAULT_RISK_POLICY_COOKIE,
  clearVaultRiskPolicyCookie,
  isVaultRiskPolicyExpired,
  parseVaultRiskPolicyCookie,
  type VaultRiskPolicy,
} from "@/lib/vault-risk-policy";
import {
  VAULT_SYNC_CONTROL_COOKIE,
  clearVaultSyncRiskOverrideCookie,
  isVaultSyncRiskOverrideEnabled,
} from "@/lib/vault-sync-control";

const adminPaths = ["/dashboard", "/users", "/approvals", "/audit-logs"];
const userPaths = [
  "/home",
  "/notes",
  "/vault",
  "/org-shared",
  "/settings",
  "/requests",
  "/help-center",
  "/contacts",
  "/dialer",
  "/phone-profile",
  "/risk-alerts",
  "/risk-check",
  "/risk-tip",
];
const authEntryPaths = ["/login"];

const publicApiPaths = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/check-register-email",
  "/api/auth/find-account",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/reset-password-pin",
  "/api/auth/reset-password-finalize",
  "/api/auth/verify-otp",
  "/api/auth/verify-reset-otp",
  "/api/auth/resend-signup-otp",
  "/api/auth/logout",
  "/api/android-release",
  "/api/runtime/diagnostics",
  "/api/version",
  "/api/notes/reminders/process",
  "/api/notifications/push/process",
]);

const riskBypassPaths = new Set([
  "/login",
  "/settings/risk-state",
  "/api/security/risk-evaluate",
  "/api/security/risk-state",
  "/api/security/url-scan",
  "/api/security/file-scan",
  "/api/runtime/diagnostics",
  "/api/version",
  ...publicApiPaths,
]);

function apiError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" },
    },
  );
}

function unauthorizedFor(request: NextRequest, message: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return apiError(message, 401);
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

function forbiddenFor(request: NextRequest, message: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return apiError(message, 403);
  }
  return NextResponse.redirect(new URL("/vault", request.url));
}

function isRiskBypassPath(pathname: string) {
  return riskBypassPaths.has(pathname) || pathname.startsWith("/api/auth/");
}

function isSensitiveSecretApiPath(pathname: string) {
  return (
    /^\/api\/vault\/[^/]+\/secret$/.test(pathname) ||
    /^\/api\/team-room-items\/[^/]+\/secret$/.test(pathname) ||
    pathname === "/api/admin/view-user-vault"
  );
}

function isSyncApiPath(pathname: string) {
  return (
    pathname === "/api/vault" ||
    pathname.startsWith("/api/vault/") ||
    pathname === "/api/team-room-items" ||
    pathname.startsWith("/api/team-room-items/") ||
    pathname === "/api/team-rooms" ||
    pathname.startsWith("/api/team-rooms/") ||
    pathname === "/api/notes" ||
    pathname.startsWith("/api/notes/")
  );
}

function isSensitiveVaultPagePath(pathname: string) {
  return pathname.startsWith("/vault") || pathname.startsWith("/org-shared") || pathname.startsWith("/settings/sync");
}

function attachRiskHeaders(
  response: NextResponse,
  policy: VaultRiskPolicy | null,
  syncRiskOverrideEnabled = false,
) {
  response.headers.set("x-vault-risk-severity", policy?.severity ?? "none");
  response.headers.set("x-vault-risk-score", policy ? String(policy.score) : "0");
  response.headers.set("x-vault-risk-actions", policy?.actions.join(",") ?? "");
  response.headers.set("x-vault-sync-risk-override", syncRiskOverrideEnabled ? "1" : "0");
}

function clearSessionCookiesForReauth(response: NextResponse, request: NextRequest) {
  const names = new Set<string>([ACTIVE_SESSION_COOKIE, FACE_PIN_SESSION_COOKIE]);
  request.cookies.getAll().forEach((cookie) => {
    if (isSupabaseAuthCookieName(cookie.name)) {
      names.add(cookie.name);
    }
  });

  names.forEach((name) => {
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      ...getSharedCookieOptions(),
      maxAge: 0,
    });
  });
}

function riskApiBlocked(
  status: number,
  code: string,
  message: string,
  policy: VaultRiskPolicy,
) {
  return NextResponse.json(
    {
      error: message,
      code,
      risk: {
        severity: policy.severity,
        score: policy.score,
        actions: policy.actions,
        expiresAt: policy.expiresAt,
      },
    },
    {
      status,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" },
    },
  );
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const requiresUser = userPaths.some((path) => pathname.startsWith(path));
  const requiresAdminPage = adminPaths.some((path) => pathname.startsWith(path));
  const isAuthEntryPath = authEntryPaths.some((path) => pathname === path);
  const isApiPath = pathname.startsWith("/api/");
  const requiresApiAuth = isApiPath && !publicApiPaths.has(pathname);
  const requiresAdminApi = pathname.startsWith("/api/admin/") || pathname === "/api/metrics";
  const needsAuth = requiresUser || requiresAdminPage || requiresApiAuth;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getSharedCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const rawRiskCookie = request.cookies.get(VAULT_RISK_POLICY_COOKIE)?.value;
  const parsedRiskPolicy = parseVaultRiskPolicyCookie(rawRiskCookie);
  const activeRiskPolicy =
    parsedRiskPolicy && !isVaultRiskPolicyExpired(parsedRiskPolicy)
      ? parsedRiskPolicy
      : null;
  const rawSyncControlCookie = request.cookies.get(VAULT_SYNC_CONTROL_COOKIE)?.value;
  const syncRiskOverrideEnabled = isVaultSyncRiskOverrideEnabled(rawSyncControlCookie, user?.id);

  if (parsedRiskPolicy && !activeRiskPolicy) {
    clearVaultRiskPolicyCookie(response);
  }

  if (!user && rawRiskCookie) {
    clearVaultRiskPolicyCookie(response);
  }

  if (!user && rawSyncControlCookie) {
    clearVaultSyncRiskOverrideCookie(response);
  }

  if (user && rawSyncControlCookie && !syncRiskOverrideEnabled) {
    clearVaultSyncRiskOverrideCookie(response);
  }

  if (needsAuth && !user) {
    const hasSessionCookie = hasSupabaseAuthCookie(request.cookies.getAll());
    const recoverableAuthState = Boolean(authError && hasSessionCookie);
    if (recoverableAuthState) {
      if (isApiPath) {
        return apiError("Session synchronization in progress. Please retry.", 503);
      }
      attachRiskHeaders(response, null, false);
      return response;
    }
    const denied = unauthorizedFor(request, "Unauthorized");
    clearVaultRiskPolicyCookie(denied);
    return denied;
  }

  if (needsAuth && user) {
    const cookieToken = request.cookies.get(ACTIVE_SESSION_COOKIE)?.value ?? "";
    const metadataToken =
      user.app_metadata && typeof user.app_metadata.pv_active_session === "string"
        ? user.app_metadata.pv_active_session
        : "";

    if (metadataToken && !cookieToken) {
      response.cookies.set({
        name: ACTIVE_SESSION_COOKIE,
        value: metadataToken,
        httpOnly: true,
        ...getSharedCookieOptions(),
      });
    }

    if (metadataToken && cookieToken && cookieToken !== metadataToken) {
      // Soft-sync mode: keep user signed in and reconcile cookie drift transparently.
      response.cookies.set({
        name: ACTIVE_SESSION_COOKIE,
        value: metadataToken,
        httpOnly: true,
        ...getSharedCookieOptions(),
      });
    }
  }

  const forceReauthActive = Boolean(
    activeRiskPolicy?.severity === "critical" && activeRiskPolicy?.actions.includes("force_reauth"),
  );
  const riskBypass = isRiskBypassPath(pathname);

  if (user && activeRiskPolicy && forceReauthActive && !riskBypass) {
    if (isApiPath) {
      const blocked = riskApiBlocked(
        401,
        "RISK_REAUTH_REQUIRED",
        "Re-authentication required because this device is currently marked as high risk.",
        activeRiskPolicy,
      );
      clearSessionCookiesForReauth(blocked, request);
      attachRiskHeaders(blocked, activeRiskPolicy, syncRiskOverrideEnabled);
      return blocked;
    }

    const redirect = NextResponse.redirect(new URL("/login?risk=reauth", request.url));
    clearSessionCookiesForReauth(redirect, request);
    attachRiskHeaders(redirect, activeRiskPolicy, syncRiskOverrideEnabled);
    return redirect;
  }

  if (isAuthEntryPath && user && !forceReauthActive) {
    const redirected = NextResponse.redirect(new URL("/home", request.url));
    attachRiskHeaders(redirected, activeRiskPolicy, syncRiskOverrideEnabled);
    return redirected;
  }

  if (user && activeRiskPolicy && !riskBypass) {
    if (isApiPath) {
      if (activeRiskPolicy.actions.includes("lock_vault_temporarily") && (isSyncApiPath(pathname) || isSensitiveSecretApiPath(pathname))) {
        const blocked = riskApiBlocked(
          423,
          "RISK_VAULT_LOCKED",
          "Vault is temporarily locked due to critical device risk.",
          activeRiskPolicy,
        );
        attachRiskHeaders(blocked, activeRiskPolicy, syncRiskOverrideEnabled);
        return blocked;
      }

      if (activeRiskPolicy.actions.includes("block_sensitive_data") && isSensitiveSecretApiPath(pathname)) {
        const blocked = riskApiBlocked(
          423,
          "RISK_SENSITIVE_DATA_BLOCKED",
          "Sensitive data is blocked until device risk is reduced.",
          activeRiskPolicy,
        );
        attachRiskHeaders(blocked, activeRiskPolicy, syncRiskOverrideEnabled);
        return blocked;
      }

      if (
        activeRiskPolicy.actions.includes("block_sync") &&
        isSyncApiPath(pathname) &&
        !syncRiskOverrideEnabled
      ) {
        const blocked = riskApiBlocked(
          423,
          "RISK_SYNC_BLOCKED",
          "Vault sync is temporarily blocked by security risk controls.",
          activeRiskPolicy,
        );
        attachRiskHeaders(blocked, activeRiskPolicy, syncRiskOverrideEnabled);
        return blocked;
      }
    } else if (activeRiskPolicy.actions.includes("lock_vault_temporarily") && isSensitiveVaultPagePath(pathname)) {
      const redirect = NextResponse.redirect(new URL("/home?risk=locked", request.url));
      attachRiskHeaders(redirect, activeRiskPolicy, syncRiskOverrideEnabled);
      return redirect;
    }
  }

  if ((requiresAdminPage || requiresAdminApi) && user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const role = profile?.role;
    if (!["admin", "super_admin", "approver"].includes(role)) {
      const denied = forbiddenFor(request, "Forbidden");
      attachRiskHeaders(denied, activeRiskPolicy, syncRiskOverrideEnabled);
      return denied;
    }
  }

  attachRiskHeaders(response, activeRiskPolicy, syncRiskOverrideEnabled);
  return response;
}

export const config = {
  matcher: [
    "/login",
    "/home/:path*",
    "/vault/:path*",
    "/org-shared/:path*",
    "/settings/:path*",
    "/requests/:path*",
    "/help-center/:path*",
    "/notes/:path*",
    "/contacts/:path*",
    "/dialer/:path*",
    "/phone-profile/:path*",
    "/risk-alerts/:path*",
    "/risk-check/:path*",
    "/risk-tip/:path*",
    "/dashboard/:path*",
    "/users/:path*",
    "/approvals/:path*",
    "/audit-logs/:path*",
    "/api/:path*",
  ],
};
