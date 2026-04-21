import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { bindActiveSession, getActiveSessionMetadataToken } from "@/lib/active-session";
import {
  ACTIVE_SESSION_COOKIE,
  createActiveSessionToken,
  getSharedCookieOptions,
} from "@/lib/session-security";

const DEFAULT_REDIRECT_PATH = "/home";

function getSafeNextPath(nextRaw: string | null) {
  const value = String(nextRaw ?? "").trim();
  if (!value) return DEFAULT_REDIRECT_PATH;
  if (!value.startsWith("/")) return DEFAULT_REDIRECT_PATH;
  if (value.startsWith("//")) return DEFAULT_REDIRECT_PATH;
  return value;
}

function redirectToLogin(origin: string, reason: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim();
  const nextPath = getSafeNextPath(url.searchParams.get("next"));

  if (!code) {
    return redirectToLogin(url.origin, "missing_oauth_code");
  }

  const supabase = await createClient();
  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) {
    console.error("OAuth callback exchange failed:", exchanged.error.message);
    return redirectToLogin(url.origin, "oauth_exchange_failed");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectToLogin(url.origin, "oauth_user_missing");
  }

  try {
    const resolved = await resolveProfileForAuthUser({
      userId: user.id,
      email: String(user.email ?? ""),
      fullName: String(user.user_metadata?.full_name ?? ""),
    });

    if (resolved.profile.status === "disabled") {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      return redirectToLogin(url.origin, "account_disabled");
    }
  } catch (resolveError) {
    console.error("OAuth callback profile resolution failed:", resolveError);
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    return redirectToLogin(url.origin, "profile_mismatch");
  }

  const binding = await bindActiveSession(user.id, user.app_metadata);
  const metadataToken = getActiveSessionMetadataToken(user.app_metadata);
  if (binding.error) {
    console.error("Active session binding failed in oauth callback:", binding.error.message);
  }
  const activeCookieToken = binding.error ? metadataToken || createActiveSessionToken() : binding.token;

  const response = NextResponse.redirect(new URL(nextPath, url.origin));
  response.cookies.set({
    name: ACTIVE_SESSION_COOKIE,
    value: activeCookieToken,
    httpOnly: true,
    ...getSharedCookieOptions(),
  });

  return response;
}
