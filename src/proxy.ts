import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAdminFeaturesEnabledServer } from "@/lib/admin-feature-flags";
import {
  ACTIVE_SESSION_COOKIE,
  getSharedCookieOptions,
  hasSupabaseAuthCookie,
} from "@/lib/session-security";

const adminPaths = ["/dashboard", "/users", "/approvals", "/audit-logs"];
const adminFeaturePagePaths = [...adminPaths, "/settings/admin-qr-login", "/requests"];
const userPaths = [
  "/home",
  "/private-contacts",
  "/billing",
  "/notes",
  "/vault",
  "/org-shared",
  "/settings",
  "/requests",
  "/help-center",
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
  "/api/billing/email-queue/process",
  "/api/notifications/push/process",
  "/api/notifications/push/enqueue-system-update",
  "/api/maintenance/cleanup-operational-data",
  "/api/maintenance/purge-deleted-accounts",
]);

function isPublicApiPath(pathname: string) {
  if (publicApiPaths.has(pathname)) return true;
  return /^\/api\/billing\/documents\/[^/]+\/export$/.test(pathname);
}

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

function adminDisabledFor(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return apiError("Admin features are temporarily disabled", 503);
  }
  const redirect = NextResponse.redirect(new URL("/home?admin=disabled", request.url));
  redirect.headers.set("Cache-Control", "no-store");
  return redirect;
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const adminFeaturesEnabled = isAdminFeaturesEnabledServer();
  const requiresUser = userPaths.some((path) => pathname.startsWith(path));
  const requiresAdminPage = adminPaths.some((path) => pathname.startsWith(path));
  const requiresAdminFeaturePage = adminFeaturePagePaths.some((path) => pathname.startsWith(path));
  const isAuthEntryPath = authEntryPaths.some((path) => pathname === path);
  const isApiPath = pathname.startsWith("/api/");
  const requiresApiAuth = isApiPath && !isPublicApiPath(pathname);
  const requiresAdminApi = pathname.startsWith("/api/admin/") || pathname === "/api/metrics";
  const requiresAdminFeatureApi =
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/metrics" ||
    pathname.startsWith("/api/admin-qr-login/");
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

  if (needsAuth && !user) {
    const hasSessionCookie = hasSupabaseAuthCookie(request.cookies.getAll());
    const recoverableAuthState = Boolean(authError && hasSessionCookie);
    if (recoverableAuthState) {
      if (isApiPath) {
        return apiError("Session synchronization in progress. Please retry.", 503);
      }
      return response;
    }
    return unauthorizedFor(request, "Unauthorized");
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
      response.cookies.set({
        name: ACTIVE_SESSION_COOKIE,
        value: metadataToken,
        httpOnly: true,
        ...getSharedCookieOptions(),
      });
    }
  }

  if (isAuthEntryPath && user) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  if (!adminFeaturesEnabled && (requiresAdminFeaturePage || requiresAdminFeatureApi)) {
    return adminDisabledFor(request);
  }

  if ((requiresAdminPage || requiresAdminApi) && user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const role = profile?.role;
    if (!["admin", "super_admin", "approver"].includes(role)) {
      return forbiddenFor(request, "Forbidden");
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/login",
    "/home/:path*",
    "/private-contacts/:path*",
    "/billing/:path*",
    "/vault/:path*",
    "/org-shared/:path*",
    "/settings/:path*",
    "/requests/:path*",
    "/help-center/:path*",
    "/notes/:path*",
    "/dashboard/:path*",
    "/users/:path*",
    "/approvals/:path*",
    "/audit-logs/:path*",
    "/api/:path*",
  ],
};
