import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

const AUTO_APPROVE_AFTER_MS = 2 * 60 * 1000;

export async function POST(req: Request) {
 const { email, password } = await req.json();
 const normalizedEmail = String(email ?? "").trim().toLowerCase();

 const ip = clientIp(req);
 const limit = takeRateLimit(`login:${ip}:${normalizedEmail}`, { limit: 10, windowMs: 5 * 60 * 1000 });
 if (!limit.allowed) {
 return NextResponse.json({ error: "Too many login attempts. Please wait.", retryAfterSec: limit.retryAfterSec }, { status: 429 });
 }

 const supabase = await createClient();
 const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
 if (error) {
 return NextResponse.json({ error: error.message }, { status: 401 });
 }

 const user = signInData?.user;
 if (!user) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const authEmail = user.email?.toLowerCase();

 const { data: profile } = await supabase
 .from("profiles")
 .select("status,email,email_verified_at,role")
 .eq("id", user.id)
 .single();

 if (authEmail) {
 if (profile?.email !== authEmail) {
 void supabase.from("profiles").update({ email: authEmail }).eq("id", user.id);
 }
 }

 if (profile?.status === "disabled") {
 await supabase.auth.signOut();
 return NextResponse.json({ error: "Account is disabled" }, { status: 403 });
 }

 let status = String(profile?.status ?? "pending_approval");
 let role = String(profile?.role ?? "pending");
 const emailVerifiedAt = profile?.email_verified_at ? String(profile.email_verified_at) : user.email_confirmed_at ? String(user.email_confirmed_at) : "";
 let autoApproved = false;

 if (emailVerifiedAt) {
 if (status === "pending_approval") {
 const verifiedAtMs = Date.parse(emailVerifiedAt);
 if (Number.isFinite(verifiedAtMs)) {
 if (Date.now() - verifiedAtMs >= AUTO_APPROVE_AFTER_MS) {
 const admin = createAdminClient();
 await admin
 .from("profiles")
 .update({ status: "active", role: role === "pending" ? "user" : role })
 .eq("id", user.id);

 await admin
 .from("approval_requests")
 .update({ request_status: "approved", reviewed_at: new Date().toISOString(), reject_reason: null })
 .eq("user_id", user.id)
 .eq("request_status", "pending");

 status = "active";
 if (role === "pending") {
 role = "user";
 }
 autoApproved = true;
 }
 }
 }
 }

 return NextResponse.json({
 ok: true,
 status,
 role,
 autoApproved,
 email: authEmail ?? normalizedEmail,
 needsOtpVerification: !emailVerifiedAt,
 pendingApproval: status !== "active",
 });
}


