import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.email() });

export async function POST(req: Request) {
 let payload: unknown = null;
 try {
 payload = await req.json();
 } catch {}

 const parsed = schema.safeParse(payload);
 if (!parsed.success) {
 return NextResponse.json({ error: "Invalid email payload" }, { status: 400 });
 }

 const normalizedEmail = parsed.data.email.trim().toLowerCase();
 const ip = clientIp(req);
 const limit = takeRateLimit(`resend-signup-otp:${ip}:${normalizedEmail}`, { limit: 1, windowMs: 60 * 1000 });

 if (!limit.allowed) {
 return NextResponse.json(
 {
 error: `For security purposes, you can only request this after ${limit.retryAfterSec} seconds.`,
 retryAfterSec: limit.retryAfterSec,
 },
 { status: 429 },
 );
 }

 const supabase = await createClient();
 const { error } = await supabase.auth.resend({
 type: "signup",
 email: normalizedEmail,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 return NextResponse.json({
 ok: true,
 retryAfterSec: 60,
 message: "OTP sent to your email",
 });
}
