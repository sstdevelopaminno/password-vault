import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  ACTIVE_SESSION_COOKIE,
  getSharedCookieOptions,
} from "@/lib/session-security";

const adminPaths = ["/dashboard", "/users", "/approvals", "/audit-logs"];
const userPaths = ["/home", "/vault", "/settings", "/requests"];
const ACTIVE_SESSION_SYNC_GRACE_MS = 20_000;

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
  "/api/notifications/push/process",
]);

function parseTokenIssuedAtMs(token: string) {
  const raw = String(token ?? "");
  if (!raw) return 0;
  const firstPart = raw.split(".")[0] ?? "";
  if (!firstPart) return 0;
  const parsed = Number.parseInt(firstPart, 36);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function parseMetadataUpdatedAtMs(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function clearAuthCookies(request: NextRequest, response: NextResponse) {
  const cookieNames = new Set<string>([ACTIVE_SESSION_COOKIE]);
  request.cookies.getAll().forEach((cookie) => {
    if (cookie.name.startsWith("sb-")) {
      cookieNames.add(cookie.name);
    }
  });

  cookieNames.forEach((name) => {
    response.cookies.set({
      name,
      value: "",
      path: "/",
      maxAge: 0,
    });
  });
}

function unauthorizedFor(request: NextRequest, message: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

function forbiddenFor(request: NextRequest, message: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  return NextResponse.redirect(new URL("/vault", request.url));
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
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
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const requiresUser = userPaths.some((path) => pathname.startsWith(path));
  const requiresAdminPage = adminPaths.some((path) => pathname.startsWith(path));
  const isApiPath = pathname.startsWith("/api/");
  const requiresApiAuth = isApiPath && !publicApiPaths.has(pathname);
  const requiresAdminApi = pathname.startsWith("/api/admin/") || pathname === "/api/metrics";
  const needsAuth = requiresUser || requiresAdminPage || requiresApiAuth;

  if (needsAuth && !user) {
    return unauthorizedFor(request, "Unauthorized");
  }

  if (needsAuth && user) {
    const cookieToken = request.cookies.get(ACTIVE_SESSION_COOKIE)?.value ?? "";
    const metadataToken =
      user.app_metadata && typeof user.app_metadata.pv_active_session === "string"
        ? user.app_metadata.pv_active_session
        : "";
    const metadataIssuedAtMs = parseTokenIssuedAtMs(metadataToken);
    const metadataUpdatedAtMs =
      user.app_metadata && typeof user.app_metadata.pv_active_updated_at === "string"
        ? parseMetadataUpdatedAtMs(user.app_metadata.pv_active_updated_at)
        : 0;
    const metadataReferenceAtMs = Math.max(metadataIssuedAtMs, metadataUpdatedAtMs);
    const cookieIssuedAtMs = parseTokenIssuedAtMs(cookieToken);
    const now = Date.now();
    const cookieLooksValidTime =
      cookieIssuedAtMs > 0 &&
      cookieIssuedAtMs <= now + 60_000;
    const cookieWithinSyncWindow =
      cookieLooksValidTime &&
      metadataReferenceAtMs > 0 &&
      Math.abs(cookieIssuedAtMs - metadataReferenceAtMs) <= ACTIVE_SESSION_SYNC_GRACE_MS;
    const cookieAppearsNewerThanMetadata =
      cookieLooksValidTime &&
      metadataReferenceAtMs > 0 &&
      cookieIssuedAtMs >= metadataReferenceAtMs;
    const metadataAppearsNewerThanCookie =
      metadataReferenceAtMs > 0 &&
      cookieIssuedAtMs > 0 &&
      metadataReferenceAtMs - cookieIssuedAtMs > ACTIVE_SESSION_SYNC_GRACE_MS;

    if (metadataToken && !cookieToken) {
      response.cookies.set({
        name: ACTIVE_SESSION_COOKIE,
        value: metadataToken,
        httpOnly: true,
        ...getSharedCookieOptions(),
      });
    }

    if (metadataToken && cookieToken && cookieToken !== metadataToken) {
      if (cookieAppearsNewerThanMetadata || cookieWithinSyncWindow) {
        if (cookieWithinSyncWindow) {
          response.cookies.set({
            name: ACTIVE_SESSION_COOKIE,
            value: metadataToken,
            httpOnly: true,
            ...getSharedCookieOptions(),
          });
        }
      } else if (metadataAppearsNewerThanCookie || !cookieLooksValidTime) {
        const out = unauthorizedFor(request, "Session expired due to login from another device.");
        clearAuthCookies(request, out);
        return out;
      }
    }
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
    "/home/:path*",
    "/vault/:path*",
    "/settings/:path*",
    "/requests/:path*",
    "/dashboard/:path*",
    "/users/:path*",
    "/approvals/:path*",
    "/audit-logs/:path*",
    "/api/:path*",
  ],
};
