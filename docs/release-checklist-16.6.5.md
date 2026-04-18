# Release Checklist 16.6.5 (2026-04-18)

## 1) APK build + signing (Done)
- [x] `package.json` and lockfile bumped to `16.6.5`
- [x] Android native version bumped:
  - `versionCode 16605`
  - `versionName "16.6.5"`
- [x] Release APK built and signed
- [x] Signed artifact copied to web download path:
  - `public/apk/vault-v16.6.5.apk`

## 2) SSO + release env preflight (Local check: Done)
- [x] `NEXT_PUBLIC_APP_URL` set
- [x] `NEXT_PUBLIC_SUPABASE_URL` set
- [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set
- [x] `SUPABASE_SERVICE_ROLE_KEY` set
- [x] `NEXT_PUBLIC_AUTH_SSO_GOOGLE_ENABLED=true`
- [x] `NEXT_PUBLIC_CAPACITOR_APP_SCHEME=com.passwordvault.app`
- [x] Android release metadata set in `.env.local`:
  - `NEXT_PUBLIC_ANDROID_APK_VERSION="16.6.5"`
  - `NEXT_PUBLIC_ANDROID_APK_VERSION_CODE="16605"`
  - `NEXT_PUBLIC_ANDROID_APK_URL="https://password-vault-ivory.vercel.app/apk/vault-v16.6.5.apk"`
  - `NEXT_PUBLIC_ANDROID_APK_PUBLISHED_AT="2026-04-18"`

## 3) Dashboard checks before production (Manual)
- [ ] Supabase Dashboard -> Authentication -> Providers -> Google: Enabled
- [ ] Supabase Dashboard -> URL Configuration -> Additional Redirect URLs includes:
  - `https://password-vault-ivory.vercel.app/auth/callback`
  - `com.passwordvault.app://auth/callback`
- [ ] Google Cloud OAuth client uses Supabase callback URL:
  - `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
- [ ] Vercel production env updated to APK 16.6.5 values
- [ ] Deploy production and smoke test:
  - Email/password login
  - Google SSO login (web + APK)
  - APK update popup appears on outdated app, disappears after app updated

