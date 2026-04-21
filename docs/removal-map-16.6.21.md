# Removal Map v16.6.21

Date: 2026-04-21  
Commit: `dd6c889c5c8989fd15084fc2776ad31e90789cef`

## Scope
This map summarizes feature removals requested for cleanup and stability, without touching real user data.

## Menu-to-Removal Map

| Legacy menu/system | Status | Removed routes/pages | Removed APIs | Removed libs/components | Replacement/notes |
|---|---|---|---|---|---|
| 1) Risk Sync + Offline Sync Center | Removed | `src/app/(user)/settings/sync/page.tsx`, `src/app/(user)/settings/risk-state/page.tsx`, `src/app/(user)/risk-check/page.tsx`, `src/app/(user)/risk-alerts/page.tsx`, `src/app/(user)/risk-tip/page.tsx` | `src/app/api/security/risk-evaluate/route.ts`, `src/app/api/security/risk-state/route.ts`, `src/app/api/security/sync-control/route.ts` | `src/components/layout/queue-unlock-prompt.tsx`, `src/components/security/vault-risk-sentinel.tsx`, `src/lib/vault-risk-client.ts`, `src/lib/vault-sync-control.ts` | Safety control path is kept in `src/lib/vault-sensitive-control.ts` (renamed scope, no legacy risk sync UI). |
| 2) Face Login + PIN (Face scope) | Removed | `src/app/(user)/settings/face-login/page.tsx` | `src/app/api/face-auth/config/route.ts`, `src/app/api/face-auth/enroll/route.ts`, `src/app/api/face-auth/recovery/request-otp/route.ts`, `src/app/api/face-auth/recovery/verify-otp/route.ts`, `src/app/api/face-auth/session/route.ts`, `src/app/api/face-auth/toggle/route.ts`, `src/app/api/face-auth/verify/route.ts` | `src/components/auth/face-pin-login-gate.tsx`, `src/lib/face-auth.ts`, `src/lib/face-template.ts` | Core account PIN flow is still active for auth/security operations. |
| 3) Phone Protection | Removed | `src/app/(user)/phone-profile/page.tsx`, `src/app/(user)/contacts/page.tsx`, `src/app/(user)/dialer/page.tsx`, `src/app/(user)/settings/mobile-permissions/page.tsx` | `src/app/api/phone/contacts/route.ts`, `src/app/api/phone/dialer/route.ts`, `src/app/api/phone/profile/route.ts`, `src/app/api/phone/risk-alerts/route.ts`, `src/app/api/phone/risk-check/route.ts`, `src/app/api/phone/risk-tips/route.ts` | `src/lib/mobile-contacts.ts`, `src/lib/phone-risk-intel.ts`, `src/lib/official-risk-sources.ts`, `src/components/security/call-risk-popup-sentinel.tsx` | Home/settings navigation now focuses on core vault + notes + org shared flows. |
| 4) Device Management (MDM) | Removed | `src/app/(user)/settings/device-management/page.tsx` | `src/app/api/mdm/action/route.ts`, `src/app/api/mdm/overview/route.ts` | `src/lib/mdm-client.ts`, `src/lib/mdm-server.ts` | MDM entrypoints and server handlers are removed. |
| 5) Extra phone/security scanners tied to legacy menus | Removed | - | `src/app/api/security/file-scan/route.ts`, `src/app/api/security/url-scan/route.ts` | `src/lib/file-threat-intel.ts`, `src/lib/url-threat-intel.ts` | Scanner endpoints removed with legacy risk module surface. |

## Core Paths Confirmed Active

- User: `/home`, `/vault`, `/notes`, `/org-shared`, `/settings`, `/help-center`
- Auth: `/login`, `/register`, `/verify-otp`, password reset routes
- APIs: vault, notes, profile, auth, support, notifications, android-release, version

## Operational Notes

- Release bumped to `16.6.21`.
- APK replaced to latest only: `public/apk/vault-v16.6.21.apk`.
- Production points to latest deployment on Vercel.
- Supabase migrations are synced (`--linked`) and up to date.
