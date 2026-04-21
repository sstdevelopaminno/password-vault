import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { profileOtpPurposeSchema } from '@/lib/validators';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: Request) {
  const body = await req.json();
  const parsedPurpose = profileOtpPurposeSchema.safeParse(body.purpose);
  if (
    !parsedPurpose.success ||
    !['change_profile', 'change_email', 'change_password'].includes(parsedPurpose.data)
  ) {
    return NextResponse.json({ error: 'Unsupported update purpose' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  if (parsedPurpose.data === 'change_email') {
    const newEmail = String(body.newEmail ?? '').trim().toLowerCase();
    if (!z.email().safeParse(newEmail).success) {
      return NextResponse.json({ error: 'Invalid new email' }, { status: 400 });
    }

    const otp = String(body.otp ?? '');
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }

    const verify = await supabase.auth.verifyOtp({
      email: newEmail,
      token: otp,
      type: 'email_change' as const,
    });

    if (verify.error) {
      return NextResponse.json({ error: verify.error.message }, { status: 400 });
    }

    const { error: profileError } = await admin.from('profiles').update({ email: newEmail }).eq('id', auth.user.id);
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    await logAudit('profile_email_changed', { actor_user_id: auth.user.id, email_target: newEmail });
    return NextResponse.json({ ok: true, message: 'Email changed successfully.' });
  }

  if (parsedPurpose.data === 'change_password') {
    const newPassword = String(body.newPassword ?? '');
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 chars' }, { status: 400 });
    }

    const { error: pwdError } = await admin.auth.admin.updateUserById(auth.user.id, { password: newPassword });
    if (pwdError) {
      return NextResponse.json({ error: pwdError.message }, { status: 400 });
    }

    await logAudit('profile_password_changed', { actor_user_id: auth.user.id });
    return NextResponse.json({ ok: true, message: 'Password changed successfully.' });
  }

  const fullName = String(body.fullName ?? '').trim();
  if (fullName.length < 2) {
    return NextResponse.json({ error: 'Full name is too short' }, { status: 400 });
  }

  const { error } = await admin.from('profiles').update({ full_name: fullName }).eq('id', auth.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAudit('profile_name_changed', { actor_user_id: auth.user.id, otp_required: false });
  return NextResponse.json({ ok: true, message: 'Profile updated successfully.' });
}

