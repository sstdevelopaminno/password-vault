import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveProfileForAuthUser } from "@/lib/supabase/admin";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import { bindActiveSession, getActiveSessionMetadataToken } from "@/lib/active-session";
import {
  ACTIVE_SESSION_COOKIE,
  createActiveSessionToken,
  getSharedCookieOptions,
} from "@/lib/session-security";
import { enqueuePushNotification, processPushQueue } from "@/lib/push-queue";

const PENDING_STATUSES = new Set(["pending_approval", "pending", "awaiting_approval"]);
const LOGIN_TIMEOUT_MS = 12_000;

function isPendingStatus(status: string) {
  return PENDING_STATUSES.has(String(status ?? "").toLowerCase());
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>(function (_, reject) {
        timer = setTimeout(function () {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => null)) as
      | { email?: unknown; password?: unknown }
      | null;
    if (!payload) {
      return NextResponse.json({ error: "Invalid or empty JSON body." }, { status: 400 });
    }

    const { email, password } = payload;
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "");

    if (!normalizedEmail || !normalizedPassword) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const ip = clientIp(req);
    const limit = await takeRateLimit(`login:${ip}:${normalizedEmail}`, { limit: 10, windowMs: 5 * 60 * 1000 });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait.", retryAfterSec: limit.retryAfterSec },
        { status: 429 },
      );
    }

    const supabase = await createClient();
    // Ensure stale local cookies won't block a fresh handover login on this device.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});

    let signInResult;
    try {
      signInResult = await withTimeout(
        supabase.auth.signInWithPassword({ email: normalizedEmail, password: normalizedPassword }),
        LOGIN_TIMEOUT_MS,
        "LOGIN_TIMEOUT",
      );
    } catch (signInTimeoutError) {
      if (signInTimeoutError instanceof Error && signInTimeoutError.message === "LOGIN_TIMEOUT") {
        return NextResponse.json({ error: "Login request timeout. Please retry." }, { status: 504 });
      }
      throw signInTimeoutError;
    }

    const { data: signInData, error } = signInResult;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const user = signInData?.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authEmail = user.email?.toLowerCase() ?? normalizedEmail;

    let profile;
    try {
      const resolved = await resolveProfileForAuthUser({
        userId: user.id,
        email: authEmail,
        fullName: String(user.user_metadata?.full_name ?? ""),
      });
      profile = resolved.profile;
    } catch (resolveError) {
      console.error("Failed to resolve profile in login:", resolveError);
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.json({ error: "Account profile mismatch. Please contact admin." }, { status: 409 });
    }

    if (profile.status === "disabled") {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.json({ error: "Account is disabled" }, { status: 403 });
    }

    const status = String(profile.status ?? "active");
    const role = String(profile.role ?? "pending");
    const emailVerifiedAt = profile.email_verified_at
      ? String(profile.email_verified_at)
      : user.email_confirmed_at
        ? String(user.email_confirmed_at)
        : "";
    const binding = await bindActiveSession(user.id, user.app_metadata);
    const metadataToken = getActiveSessionMetadataToken(user.app_metadata);
    if (binding.error) {
      console.error("Active session binding failed in login, fallback to metadata token:", binding.error.message);
    }
    const activeCookieToken = binding.error ? metadataToken || createActiveSessionToken() : binding.token;

    const needsOtpVerification = !emailVerifiedAt;
    const pendingApproval = isPendingStatus(status);

    const response = NextResponse.json({
      ok: true,
      status,
      role,
      autoApproved: false,
      email: authEmail,
      needsOtpVerification,
      pendingApproval,
      activeSessionBound: !binding.error,
    });

    response.cookies.set({
      name: ACTIVE_SESSION_COOKIE,
      value: activeCookieToken,
      httpOnly: true,
      ...getSharedCookieOptions(),
    });

    void enqueuePushNotification({
      userId: user.id,
      kind: "auth",
      title: "Login successful",
      message: `A login was completed from IP ${ip}.`,
      href: "/home",
      tag: "auth-login-success",
      priority: 6,
    })
      .then((queued) => {
        if (!queued.ok) return;
        void processPushQueue({ batchSize: 10 }).catch((queueError) => {
          console.error("Push process after login failed:", queueError);
        });
      })
      .catch((queueError) => {
        console.error("Push enqueue on login failed:", queueError);
      });

    return response;
  } catch (error) {
    console.error("Unhandled login error:", error);
    return NextResponse.json(
      { error: "Login service unavailable. Please retry." },
      { status: 500 },
    );
  }
}





