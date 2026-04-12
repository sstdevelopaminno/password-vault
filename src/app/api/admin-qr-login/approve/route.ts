import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isAdminQrPayloadExpired,
  parseAdminQrInlinePayload,
  parseAdminQrPayload,
} from "@/lib/admin-qr-login";

const ALLOWED_ADMIN_ROLES = new Set(["approver", "admin", "super_admin"]);

const requestSchema = z
  .object({
    qrPayload: z.string().trim().min(12).optional(),
    challengeId: z.string().uuid().optional(),
    challengeToken: z.string().min(20).optional(),
    nonce: z.string().min(8).optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
    origin: z.string().url().optional(),
    decision: z.enum(["approve", "reject"]).default("approve"),
    reason: z.string().trim().min(3).max(200).optional(),
    appInstanceId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

type ProfileRow = {
  id: string;
  email: string;
  role: string;
  status: string;
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice("bearer ".length).trim();
  return token || null;
}

function normalizeOrigin(value: string) {
  return new URL(value).origin;
}

export async function POST(request: Request) {
  const integrationSecret = String(process.env.ADMIN_QR_LOGIN_INTEGRATION_SECRET ?? "").trim();
  const adminAppBaseUrl = String(process.env.ADMIN_APP_BASE_URL ?? "").trim();

  if (!integrationSecret || integrationSecret.length < 16) {
    return NextResponse.json({ error: "QR integration secret is not configured" }, { status: 503 });
  }

  if (!adminAppBaseUrl) {
    return NextResponse.json({ error: "ADMIN_APP_BASE_URL is not configured" }, { status: 503 });
  }

  let adminOrigin: string;
  try {
    adminOrigin = normalizeOrigin(adminAppBaseUrl);
  } catch {
    return NextResponse.json({ error: "ADMIN_APP_BASE_URL is invalid" }, { status: 503 });
  }

  let bodyRaw: unknown;
  try {
    bodyRaw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsedBody = requestSchema.safeParse(bodyRaw);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const input = parsedBody.data;
  const parsedChallenge = input.qrPayload
    ? parseAdminQrPayload(input.qrPayload)
    : parseAdminQrInlinePayload({
        challengeId: input.challengeId,
        challengeToken: input.challengeToken,
        nonce: input.nonce,
        expiresAt: input.expiresAt,
        origin: input.origin,
      });

  if (!parsedChallenge.ok) {
    return NextResponse.json({ error: parsedChallenge.error }, { status: 400 });
  }

  if (isAdminQrPayloadExpired(parsedChallenge.payload)) {
    return NextResponse.json({ error: "QR challenge is expired" }, { status: 409 });
  }

  if (normalizeOrigin(parsedChallenge.payload.origin) !== adminOrigin) {
    return NextResponse.json({ error: "QR challenge origin mismatch" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const bearerToken = getBearerToken(request);

  let accessToken = bearerToken;
  if (!accessToken) {
    const { data: sessionData } = await supabase.auth.getSession();
    accessToken = sessionData.session?.access_token ?? null;
  }

  const { data: authData, error: authError } = accessToken
    ? await supabase.auth.getUser(accessToken)
    : await supabase.auth.getUser();

  if (authError || !authData.user || !accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email,role,status")
    .eq("id", authData.user.id)
    .maybeSingle<ProfileRow>();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (profile.status !== "active" || !ALLOWED_ADMIN_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "This account is not allowed to approve admin QR login" }, { status: 403 });
  }

  const upstreamResponse = await fetch(`${adminOrigin}/api/integrations/qr-login/approve`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${integrationSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      challengeId: parsedChallenge.payload.challengeId,
      challengeToken: parsedChallenge.payload.challengeToken,
      nonce: parsedChallenge.payload.nonce,
      userAccessToken: accessToken,
      decision: input.decision,
      reason: input.reason,
      appInstanceId: input.appInstanceId ?? request.headers.get("x-app-instance-id") ?? "user-app",
    }),
    cache: "no-store",
  });

  const upstreamBody = (await upstreamResponse.json().catch(() => ({}))) as Record<string, unknown>;

  if (!upstreamResponse.ok) {
    return NextResponse.json(
      { error: String(upstreamBody.error ?? "Unable to approve QR login"), upstreamStatus: upstreamResponse.status },
      { status: upstreamResponse.status },
    );
  }

  return NextResponse.json({
    ok: true,
    challenge: upstreamBody.challenge ?? null,
  });
}

