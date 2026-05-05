# QA Report: Physical Device Payment (APK + PWA) - Initial from Smoke

Date: 2026-05-05  
Tester: Codex (Automation smoke run)  
Device model / OS: N/A (automation only)  
App version / APK version: 16.6.36  
PWA browser version: N/A (automation only)  
Environment URL: https://password-vault-ivory.vercel.app

## Summary
- Overall: FAIL (ยังไม่ผ่านเกณฑ์ Physical Device)
- Critical issues: 0
- High issues: 0

## APK Results
1. Login + open package page: PASS (WebView simulation)
2. QR payment popup centered: PENDING (ต้องยืนยันบนเครื่องจริง)
3. Upload slip from gallery/camera: PENDING (ต้องยืนยันบนเครื่องจริง)
4. Progress bar scan/upload/verify: PENDING (ต้องยืนยันบนเครื่องจริง)
5. Auto-fill + field lock: PENDING (ต้องยืนยันบนเครื่องจริง)
6. Auto next step after verify success: PENDING (ต้องยืนยันบนเครื่องจริงด้วยสลิปจริง)
7. Negative slip reject: PASS (WebView simulation)

Notes:
- จาก smoke ล่าสุด `apk_authenticated_e2e_simulated_webview` ผ่านครบ flow สำคัญเชิง API/ธุรกิจ
- ยังไม่มีหลักฐานจากกล้อง/แกลเลอรีจริงของ Android device

## PWA Results
1. Install PWA + login: PENDING (ต้องยืนยัน install flow จริงบนมือถือ)
2. Wallet top-up QR flow: PASS (automation API + auth flow)
3. Upload slip from gallery/camera: PENDING (ต้องยืนยันบนมือถือจริง)
4. Progress bar scan/upload/verify: PENDING (ต้องยืนยัน visual behavior บนเครื่องจริง)
5. Auto-fill + field lock: PENDING (ต้องยืนยันบนเครื่องจริง)
6. Wallet balance updated after success: PASS (smoke ยืนยัน wallet before/after)
7. Negative slip reject: PASS (automation ยืนยัน reject reason)

Notes:
- unauth PWA smoke ผ่าน 11/11 endpoint checks
- authenticated flow ผ่านครบ login, checkout, wallet delta, promptpay order, และ negative verify

## Performance Observations
- UI lag (none/low/medium/high): low (จากการรัน smoke API)
- Upload delay (sec): N/A (ยังไม่ได้วัดบนมือถือจริง)
- OCR perceived speed: N/A (ยังไม่ได้วัดบนมือถือจริง)
- Any freeze/crash: ไม่พบจาก automation

## Bugs Found
- ID: N/A
- Severity: N/A
- Steps to reproduce: N/A
- Expected: N/A
- Actual: N/A
- Screenshot/Video: N/A

## Final Sign-off
- Ready for release: NO
- Blockers:
  - ยังไม่จบรอบ Physical Device QA สำหรับ APK (gallery/camera + permission + visual progress)
  - ยังไม่จบรอบ Physical Device QA สำหรับ PWA install + slip upload on-device

## Source References
- `docs/smoke-report-payment-pwa-apk-2026-05-05.md`
- `docs/smoke-report-payment-pwa-apk-2026-05-04.md`
