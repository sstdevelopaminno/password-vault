import { NextResponse } from "next/server";
import { z } from "zod";
import { findAuthUserByEmail, resolveProfileForAuthUser, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyPin } from "@/lib/pin";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

const resetByPinSchema = z.object({
 email: z.email(),
 pin: z.string().regex(/\d{6}$/),
 newPassword: z.string().min(8),
});

const INVALID_RESET_BY_PIN_MESSAGE = "Unable to reset password with the provided credentials.";

export async function POST(req: Request) {
 const payload = await req.json();
 const parsed = resetByPinSchema.safeParse(payload);
 if (!parsed.success) {
 return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
 }

 const email = parsed.data.email.trim().toLowerCase();
 const { pin, newPassword } = parsed.data;
 const ip = clientIp(req);
 const limit = takeRateLimit(`reset-password-pin:${ip}:${email}`, { limit: 5, windowMs: 15 * 60 * 1000 });
 if (!limit.allowed) {
 return NextResponse.json(
 { error: "Too many reset attempts. Please wait.", retryAfterSec: limit.retryAfterSec },
 { status: 429 },
 );
 }

 const authUser = await findAuthUserByEmail(email);
 if (!authUser?.id) {
 return NextResponse.json({ error: INVALID_RESET_BY_PIN_MESSAGE }, { status: 403 });
 }

 const resolved = await resolveProfileForAuthUser({
 userId: authUser.id,
 email: authUser.email,
 fullName: "",
 });
 const profile = resolved.profile;

 const validPin =
 profile.status === "active" &&
 typeof profile.pin_hash === "string" &&
 profile.pin_hash.length &&
 (await verifyPin(pin, profile.pin_hash));
 if (!validPin) {
 return NextResponse.json({ error: INVALID_RESET_BY_PIN_MESSAGE }, { status: 403 });
 }

 const admin = createAdminClient();
 const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
 password: newPassword,
 });

 if (updateError) {
 return NextResponse.json({ error: updateError.message }, { status: 400 });
 }

 const supabase = await createClient();
 const { error: signInError } = await supabase.auth.signInWithPassword({
 email: authUser.email,
 password: newPassword,
 });

 if (signInError) {
 return NextResponse.json({ error: "Password updated but sign-in did not complete. Please log in manually." }, { status: 500 });
 }

 return NextResponse.json({ ok: true, message: "Password reset successful" });
}
