# Vault (Production-Ready Mobile-First Scaffold)

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS + shadcn-style components
- Supabase Auth + Postgres + RLS
- Node.js API Routes
- AES-256-GCM server-side encryption

## Folder Structure
```txt
src/
  app/
    (public)/
      login/
      register/
      forgot-password/
      verify-otp/
    (user)/
      home/
      vault/
      vault/[id]/
      settings/
    (admin)/
      dashboard/
      approvals/
      users/
      audit-logs/
    api/
      auth/
        register/
        login/
        forgot-password/
        reset-password/
        verify-otp/
      profile/
        request-otp/
        update/
      vault/
      vault/[id]/
      vault/[id]/secret/
      pin/
        set/
        verify/
      otp/
        send/
        verify/
      admin/
        stats/
        approvals/
        users/
        view-user-vault/
        audit-logs/
  components/
    admin/
    auth/
    layout/
    ui/
    vault/
  lib/
    admin.ts
    audit.ts
    auth.ts
    crypto.ts
    otp.ts
    pin.ts
    pin-guard.ts
    rbac.ts
    supabase/
      admin.ts
      client.ts
      server.ts
    utils.ts
    validators.ts
  middleware.ts
  types/

supabase/
  migrations/
    20260325_init_password_vault.sql
    20260325_otp_hardening.sql
```

## Core Features Implemented
- Email/password auth + admin approval gate
- OTP system (signup, reset_password, change_profile, change_email, change_password)
- OTP expiry 5 min + abuse limits
- PIN set/change (hashed) + PIN assertion token checks for sensitive actions
- Encrypted vault CRUD (AES-256-GCM)
- Admin dashboard + approvals + user management + view user vault (PIN) + audit logs
- Mobile-first UI: bottom nav, FAB, bottom sheet, OTP slots, PIN modal (6-digit), toasts/spinner

## Supabase Schema + RLS
- Tables: `profiles`, `vault_items`, `approval_requests`, `otp_requests`, `audit_logs`, `sessions_security`
- RLS policies included in migrations under `supabase/migrations/`

## Environment
Use `.env.example` and set:
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ENCRYPTION_KEY`
- `OTP_PROVIDER` (`engagelab` or `resend`)
- `OTP_ENGAGELAB_DEV_KEY`
- `OTP_ENGAGELAB_DEV_SECRET`
- `OTP_ENGAGELAB_TEMPLATE_ID`
- `OTP_ENGAGELAB_TEMPLATE_LANG` (optional)
- `OTP_RESEND_API_KEY` (Resend key for secondary fallback)
- `OTP_EMAIL_PROVIDER_KEY` (legacy/shared key, optional)
- `OTP_HASH_SECRET`
- `OTP_EMAIL_FROM`
- `OTP_APP_NAME`
- `OPENAI_API_KEY`

## Run
```bash
npm install
npm run dev
```

## Android APK Release (Capacitor)
```bash
npm run cap:sync:android
npm run apk:android:release
```

Detailed release steps and compatibility rules:
- `docs/android-apk-release-guide.md`

## GitHub Actions (1+2)
- Auto release on tag: `.github/workflows/android-apk-release-on-tag.yml`
  - push tag like `v16.6.3` -> build/sign APK + attach to GitHub Release
- One-click production: `.github/workflows/android-one-click-prod.yml`
  - manual run -> optional lint/typecheck/build, APK sign, Supabase push, Vercel deploy, GitHub Release

## Ops Checks
```bash
# 1) Validate OTP provider/env readiness
npm run check:otp-env

# Optional: send real provider probe email (will send one test message)
node scripts/check-otp-env.mjs --probe-email=ops@your-domain.com

# Optional: probe both EngageLab/Resend and Supabase OTP in one run
node scripts/check-otp-env.mjs --probe-email=user@your-domain.com --probe-supabase

# 2) Smoke test Face Login + PIN flow (requires local app running)
npm run smoke:face-auth

# Optional stricter mode (fails if recovery OTP request is not 2xx)
node scripts/smoke-face-auth.mjs --strict-otp-request
```
