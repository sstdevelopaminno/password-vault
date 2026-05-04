# Smoke Test Report: Payment + Wallet + Slip (PWA + APK)

Date: 2026-05-04  
Target version: 16.6.35

## Build and Runtime Validation
- Web/PWA build: PASS (`next build --webpack`)
- Type generation: PASS (`next typegen`)
- TypeScript: PASS (`tsc --noEmit`)
- Capacitor Android sync: PASS (`capacitor sync android`)
- Android APK release build: PASS (`scripts/build-android-apk.mjs`)

## APK Artifact Validation
- `android/app/build/outputs/apk/release/app-release.apk` exists
- `public/apk/vault-v16.6.35.apk` exists
- Signed APK output generated on build run timestamp 2026-05-04

## PWA Smoke (Unauthenticated Route/API Behavior)
Executed with inline run: start Next server on port `3013`, run checks, stop server.

Results:
- `GET /` -> 200 (PASS)
- `GET /login` -> 200 (PASS)
- `GET /manifest.webmanifest` -> 200 (PASS)
- `GET /api/packages/plans?locale=th` -> 401 (PASS, protected endpoint policy)
- `GET /api/packages/current` -> 401 (PASS)
- `GET /api/packages/wallet` -> 401 (PASS)
- `POST /api/packages/checkout` -> 401 (PASS)
- `POST /api/packages/slip/upload` -> 401 (PASS)
- `POST /api/packages/slip/verify` -> 401 (PASS)
- `POST /api/packages/wallet/topup` -> 401 (PASS)
- `POST /api/packages/wallet/topup/verify` -> 401 (PASS)

Aggregate:
- Checked: 11
- Passed: 11
- Failed: 0

## Authenticated E2E (Requested 1+2)
Execution date: 2026-05-04  
Mode: local dev server + real login session + seeded QA user

Scenario 1: PWA authenticated E2E
- Login: PASS (200)
- Get current package: PASS (200)
- Wallet before: PASS (500 THB)
- Wallet checkout (`business` monthly): PASS (200)
- Wallet after: PASS (151 THB)
- PromptPay order creation (`pro` monthly): PASS (200, order created)
- Negative slip verify mismatch: PASS (rejected with mismatch reasons)

Scenario 2: APK authenticated E2E (WebView user-agent simulation)
- Login: PASS (200)
- Get current package: PASS (200)
- Wallet before: PASS (151 THB)
- Wallet checkout (`lite` monthly): PASS (200)
- Wallet after: PASS (72 THB)
- PromptPay order creation (`pro` monthly): PASS (200, order created)
- Negative slip verify mismatch: PASS (rejected with mismatch reasons)

Authenticated aggregate:
- Scenarios: 2
- Passed: 2
- Failed: 0

## Risk Summary Before Release
- Low risk: build pipeline and packaging path for both PWA/APK passed.
- Medium risk: APK scenario used WebView UA simulation; physical-device APK validation is still required for camera/gallery permission flow.
- Medium risk: OCR anti-fraud false-negative/false-positive behavior still needs ongoing manual tuning with real bank slip samples.

## Release Recommendation
- Technical build readiness: READY
- Production payment readiness: READY WITH FINAL DEVICE QA GATE
- Required manual gate:
  - 1 physical Android APK run with real camera/gallery slip upload
  - 1 physical Android PWA run with real browser install mode
  - 1 real-banking-end slip sample batch (per bank UI variants)
