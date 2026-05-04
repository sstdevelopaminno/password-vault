# QA Checklist: Payment + Wallet + Slip (PWA + APK)

Date: 2026-05-04  
Version target: 16.6.35

## Scope
- Package selection and payment flow
- Wallet top-up and wallet payment
- Slip upload and verification (internal OCR engine)
- Access control and entitlement enforcement
- Runtime compatibility split between PWA and Android APK

## Environment Preconditions
- `.env.local` has payment and wallet variables configured
- Supabase migrations applied for wallet/package tables
- PromptPay target configured (`PROMPTPAY_TARGET_PHONE`)
- Internal slip verifier enabled (`PAYMENT_SLIP_INTERNAL_ENABLED=1`)

## PWA Functional Checks
- Open `/our-packages` and load package cards successfully
- Select paid package and show payment method dialog (wallet / PromptPay QR)
- Wallet payment succeeds only when balance is enough
- Wallet payment is blocked with clear error when balance is insufficient
- PromptPay payment creates order with unique amount and expiry
- Slip file upload succeeds and returns signed URL
- Slip verify succeeds only when amount/account/date/time checks pass
- Slip verify rejects mismatch amount
- Slip verify rejects mismatch date (transfer date != order date)
- Slip verify rejects delayed submit beyond configured threshold
- Slip verify rejects suspicious/tamper signal
- Wallet page shows updated balance after top-up verify success

## APK Functional Checks
- `cap sync android` completes without plugin sync error
- APK release build produces `app-release.apk`
- Installed APK opens app and reaches login/home
- `/our-packages` flow usable in APK WebView
- `/wallet` flow usable in APK WebView
- QR render visible and scannable in APK
- Slip image upload works from device gallery/camera source
- Local notifications capability does not break package/wallet flow
- Capacitor runtime does not break auth/session on payment APIs

## Security Checks
- Unauthorized user gets `401` on package/wallet/slip APIs
- Slip upload accepts image MIME only
- Slip upload enforces max file size
- Slip verification does not auto-approve when no slip image exists
- Internal OCR verdict includes suspicious flags when signals are detected
- Entitlement limits still enforce after package changes

## Regression Checks
- Build web (`next build`) passes
- Type generation and TypeScript checks pass
- Existing routes still build and render
- Wallet history remains readable after payment/top-up
- Package current endpoint still returns consistent payload for active user

## Exit Criteria
- All smoke checks pass
- No `500` on payment/wallet/slip endpoints in smoke run
- APK artifact generated and copied to `public/apk`
- Manual device validation completed for at least 1 Android APK runtime and 1 Android PWA runtime
