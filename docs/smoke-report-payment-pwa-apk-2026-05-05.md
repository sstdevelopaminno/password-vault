# Smoke Test Report: Payment + Wallet + Slip (PWA + APK)

Date: 2026-05-05  
Target runtime: production (`https://password-vault-ivory.vercel.app`)

## Scope
- PWA route/API smoke (unauthenticated)
- Authenticated E2E payment flow (PWA + APK WebView simulation)
- Wallet checkout, PromptPay order creation, and negative slip verification

## PWA Smoke (Unauthenticated)
Command: `scripts/smoke-pwa-payment.mjs`  
Base URL: `https://password-vault-ivory.vercel.app`

Result:
- Checked: 11
- Passed: 11
- Failed: 0

Key endpoints:
- `GET /` -> `200`
- `GET /login` -> `200`
- `GET /manifest.webmanifest` -> `200`
- Protected payment APIs -> `401` as expected

## Authenticated E2E (PWA + APK)
Command: `scripts/e2e-auth-payment.ps1`  
Execution mode: production URL + temporary QA user

### Scenario 1: `pwa_authenticated_e2e`
- Login: PASS (`200`)
- Current package: PASS (`200`)
- Wallet before: PASS (`500 THB`)
- Wallet checkout (`business`, monthly): PASS (`200`)
- Wallet after: PASS (`151 THB`)
- PromptPay order creation: PASS (`200`, order created)
- Negative slip verify: PASS (expected reject with mismatch reasons)

### Scenario 2: `apk_authenticated_e2e_simulated_webview`
- Login: PASS (`200`)
- Current package: PASS (`200`)
- Wallet before: PASS (`151 THB`)
- Wallet checkout (`lite`, monthly): PASS (`200`)
- Wallet after: PASS (`72 THB`)
- PromptPay order creation: PASS (`200`, order created)
- Negative slip verify: PASS (expected reject with mismatch reasons)

## Overall Result
- PWA smoke: PASS
- Authenticated payment flow: PASS
- APK WebView simulation flow: PASS

## Notes
- APK scenario is user-agent WebView simulation, not physical-device camera/gallery validation.
- A physical Android APK run is still recommended before release for final confidence on native permission + file picker behavior.
