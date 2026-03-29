import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const AUTO_APPROVE_AFTER_MS = 2 * 60 * 1000;

export async function GET() {
 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();

 if (!auth.user) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { data: profile } = await supabase
 .from("profiles")
 .select("full_name,email,role,status,email_verified_at")
 .eq("id", auth.user.id)
 .maybeSingle();

 let status = String(profile?.status ?? "pending_approval");
 let role = String(profile?.role ?? "pending");
 const emailVerifiedAt = profile?.email_verified_at ? String(profile.email_verified_at) : auth.user.email_confirmed_at ? String(auth.user.email_confirmed_at) : "";

 if (emailVerifiedAt) {
 if (status === "pending_approval") {
 const verifiedAtMs = Date.parse(emailVerifiedAt);
 if (Number.isFinite(verifiedAtMs)) {
 const enoughElapsed = Date.now() - verifiedAtMs - AUTO_APPROVE_AFTER_MS;
 if (Math.sign(enoughElapsed) !== -1) {
 const admin = createAdminClient();
 await admin
 .from("profiles")
 .update({ status: "active", role: role === "pending" ? "user" : role })
 .eq("id", auth.user.id);

 await admin
 .from("approval_requests")
 .update({ request_status: "approved", reviewed_at: new Date().toISOString(), reject_reason: null })
 .eq("user_id", auth.user.id)
 .eq("request_status", "pending");

 status = "active";
 if (role === "pending") {
 role = "user";
 }
 }
 }
 }
 }

 return NextResponse.json({
 ok: true,
 fullName: String(profile?.full_name ?? auth.user.user_metadata?.full_name ?? ""),
 email: String(profile?.email ?? auth.user.email ?? ""),
 role,
 status,
 emailVerifiedAt,
 needsOtpVerification: !emailVerifiedAt,
 pendingApproval: status !== "active",
 });
}
