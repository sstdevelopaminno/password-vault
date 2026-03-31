# Production OTP Architecture

## Goals
- Keep OTP delivery available during provider throttling.
- Support high signup/reset volume without blocking legitimate users.
- Provide clear retry windows and predictable user experience.
- Preserve security controls (short TTL, attempt limits, abuse detection).

## Current Design (After This Phase)
- Layer 1 (Primary): Supabase Auth email OTP delivery.
- Layer 2 (Fallback): Supabase Admin `generateLink` + external provider email send (Resend API via `OTP_EMAIL_PROVIDER_KEY`).
- Unified API response for throttling: `429` with `retryAfterSec`.
- UI cooldown logic reads `retryAfterSec` to avoid duplicate/false alerts.

## Request Flows

### Signup OTP
1. Client calls `POST /api/auth/register` without `otp`.
2. API attempts `supabase.auth.signUp` or `supabase.auth.resend`.
3. If send constraint/rate-limit occurs:
   - API generates OTP with Admin API (`generateLink`).
   - API sends OTP via external provider (Resend).
4. Client receives `{ ok: true, otpRequired: true, channel, retryAfterSec }`.

### Forgot Password OTP
1. Client calls `POST /api/auth/forgot-password`.
2. API attempts `supabase.auth.signInWithOtp`.
3. On send constraint/rate-limit:
   - API uses Admin `generateLink(type: recovery)`.
   - API sends OTP via external provider.
4. Client receives `{ ok: true, channel, retryAfterSec }`.

### Verify Reset OTP
- Verification tries `type: email`, then fallback `type: recovery`.

## Environment Requirements
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OTP_PROVIDER` (`engagelab` or `resend`)
- For EngageLab:
- `OTP_ENGAGELAB_DEV_KEY`
- `OTP_ENGAGELAB_DEV_SECRET`
- `OTP_ENGAGELAB_TEMPLATE_ID`
- `OTP_ENGAGELAB_TEMPLATE_LANG` (optional, default `default`)
- For Resend (optional alternative):
- `OTP_EMAIL_PROVIDER_KEY` (Resend API key)
- `OTP_EMAIL_FROM` (verified sender/domain)
- `OTP_APP_NAME`

## Scale Recommendations (Next Steps)
- Move in-memory rate-limit to distributed store (Upstash Redis or Supabase pgmq/kv).
- Add per-IP + per-email + per-device fingerprints with tiered thresholds.
- Add provider health circuit breaker:
  - Auto-disable unhealthy provider for 1-5 minutes.
  - Route new traffic to healthy provider.
- Add queue for outbound OTP (BullMQ/Upstash QStash/Supabase queue) for burst smoothing.
- Add delivery events and dashboards:
  - send success rate
  - latency p50/p95
  - 429 rate by endpoint/provider
  - bounce/complaint rate

## Suggested SLO
- OTP send success: >= 99.5% (5-min window)
- OTP API p95 latency: <= 800ms
- Fallback activation: alert when > 10% for 10 minutes

## Incident Runbook (Short)
1. Check provider status and OTP API 429/error spike.
2. Validate env vars on Vercel production.
3. Force fallback provider routing if Supabase email send is degraded.
4. Increase temporary retry windows in UI (backoff) if abuse wave detected.
5. Publish status message to users: retry ETA and current channel health.
