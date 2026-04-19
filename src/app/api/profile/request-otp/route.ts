import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { profileOtpPurposeSchema } from '@/lib/validators';
import { clientIp, takeRateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const payload = await req.json();
  const parsedPurpose = profileOtpPurposeSchema.safeParse(payload.purpose);
  if (!parsedPurpose.success) {
    return NextResponse.json({ error: 'Unsupported profile OTP purpose' }, { status: 400 });
  }

  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  const user = auth.data.user;
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = clientIp(req);
  const rateKey = `profile-otp:${parsedPurpose.data}:${ip}:${user.id}`;
  const rate = await takeRateLimit(rateKey, { limit: 3, windowMs: 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json({
      error: 'OTP rate limited. Please wait.',
      otpAlreadyRequested: true,
      retryAfterSec: rate.retryAfterSec,
      message: 'OTP rate limited. Please wait.',
    }, { status: 429 });
  }

  const profileRes = await supabase.from('profiles').select('email').eq('id', user.id).single();
  const profile = profileRes.data;

  if (parsedPurpose.data === 'change_email') {
    const newEmail = String(payload.email ?? '').trim().toLowerCase();
    if (!z.email().safeParse(newEmail).success) {
      return NextResponse.json({ error: 'Invalid new email format' }, { status: 400 });
    }

    const currentEmail = String(user.email ?? '').trim().toLowerCase();
    if (currentEmail === newEmail) {
      return NextResponse.json({ error: 'New email must be different from current email' }, { status: 400 });
    }

    if (!z.email().safeParse(currentEmail).success) {
      const admin = createAdminClient();
      const recoveryEmail = `recovery+${String(user.id).slice(0, 12)}@example.com`;
      const recoveryRes = await admin.auth.admin.updateUserById(user.id, { email: recoveryEmail });
      if (recoveryRes.error) {
        return NextResponse.json({ error: 'Current email is invalid and auto-recovery failed' }, { status: 400 });
      }
    }

    const updateRes = await supabase.auth.updateUser({ email: newEmail });
    if (updateRes.error) {
      const message = String(updateRes.error.message ?? 'Failed to send OTP');
      const lower = message.toLowerCase();
      if (lower.includes('rate limit')) {
        return NextResponse.json({
          error: 'OTP rate limited. Please wait.',
          otpAlreadyRequested: true,
          retryAfterSec: 60,
          message: 'OTP rate limited. Please wait.',
        }, { status: 429 });
      }
      if (lower.includes('email address') && lower.includes('is invalid')) {
        return NextResponse.json({
          error: 'OTP already sent to your new email. Please enter 6-digit OTP.',
          otpAlreadyRequested: true,
          retryAfterSec: 60,
          message: 'OTP already sent to your new email. Please enter 6-digit OTP.',
        }, { status: 409 });
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: 'OTP sent to new email. Please verify with 6 digits.' });
  }

  const targetEmail = String(profile?.email ?? '').toLowerCase();
  if (!targetEmail) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const otpRes = await supabase.auth.signInWithOtp({
    email: targetEmail,
    options: { shouldCreateUser: false },
  });

  if (otpRes.error) {
    return NextResponse.json({ error: otpRes.error.message }, { status: 429 });
  }

  return NextResponse.json({ ok: true, message: 'OTP sent.' });
}

