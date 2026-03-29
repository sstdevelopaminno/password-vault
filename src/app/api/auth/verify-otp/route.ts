import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signupOtpVerifySchema } from "@/lib/validators";

export async function POST(req: Request) {
 const payload = await req.json();
 const parsed = signupOtpVerifySchema.safeParse(payload);
 if (!parsed.success) {
 return NextResponse.json({ error: "Invalid OTP payload" }, { status: 400 });
 }

 const normalizedEmail = parsed.data.email.toLowerCase();
 const supabase = await createClient();
 const admin = createAdminClient();

 const firstTry = await supabase.auth.verifyOtp({
 email: normalizedEmail,
 token: parsed.data.otp,
 type: "signup",
 });

 if (firstTry.error) {
 const fallback = await supabase.auth.verifyOtp({
 email: normalizedEmail,
 token: parsed.data.otp,
 type: "email",
 });

 if (fallback.error) {
 return NextResponse.json({ error: firstTry.error.message }, { status: 400 });
 }
 }

 await admin
 .from("profiles")
 .update({ email_verified_at: new Date().toISOString(), status: "pending_approval", role: "user" })
 .eq("email", normalizedEmail);

 const { data: authData } = await supabase.auth.getUser();
 const userId = authData.user?.id;

 if (userId) {
 const { data: pendingRequest } = await admin
 .from("approval_requests")
 .select("id")
 .eq("user_id", userId)
 .eq("request_status", "pending")
 .maybeSingle();

 if (!pendingRequest?.id) {
 await admin.from("approval_requests").insert({
 user_id: userId,
 request_status: "pending",
 });
 }
 }

 return NextResponse.json({
 ok: true,
 pendingApproval: true,
 message: "OTP verified. Auto approval will complete in 1-2 minutes.",
 });
}
