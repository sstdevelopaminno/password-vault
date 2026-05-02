# QA Checklist: Mobile Install + Smoke Test (APK) — v16.6.33

Date: 2026-05-02  
Build under test:
- APK version: `16.6.33`
- Version code: `16633`
- Package: `com.passwordvault.app`
- APK URL: `https://password-vault-ivory.vercel.app/apk/vault-v16.6.33.apk`

## 1) Test Matrix
- Android device A (Android 12+): full smoke including biometric unlock
- Android device B (Android 10/11): smoke + biometric compatibility check
- Optional device C (no biometric enrolled): fallback behavior check

## 2) Preconditions
- Internet is available.
- Device battery > 30%.
- Printer test is optional for this round.
- Test account is ready (login + has PIN configured or can configure PIN).
- If device has biometric sensor, ensure fingerprint/face is enrolled at OS level.

## 3) Installation Checklist

### 3.1 Clean Install
1. Uninstall previous app (if testing clean install path).
Expected: old app removed successfully.

2. Open APK URL and download `vault-v16.6.33.apk`.
Expected: file download completed.

3. Install APK (allow `Install unknown apps` if prompted).
Expected: installation completes without parse/signature error.

4. Open app.
Expected: app launches normally, no immediate crash.

### 3.2 Upgrade Install (Optional but recommended)
1. Keep old app installed, then install `v16.6.33` over it.
Expected: upgrade succeeds, app data/session remain intact.

## 4) Smoke Test Checklist (Focus on latest fixes)

### A. เมนูส่วนตัว (Vault Detail UI)
1. Go to `ส่วนตัว` and open one item detail.
Expected: top spacing is not too tight; layout looks balanced.

2. Review content block density.
Expected: unnecessary nested containers are reduced; readability improved.

### B. เมนูโน้ต (Create Note UI)
1. Go to `โน้ต` and tap `สร้างโน้ตใหม่`.
Expected: editor appears with paper-style writing area and proper top spacing.

2. Check toolbar/buttons in editor.
Expected: non-essential controls are hidden; UI is simpler like the target example.

3. Enter title + content and save.
Expected: save succeeds and note appears in list.

### C. หน้ารายละเอียดเอกสารบิล (White-gap issue)
1. Open any Billing document detail.
Expected: no confusing white strip/gap between main content areas.

2. Verify text contrast in content blocks.
Expected: labels and line-items are clearly visible.

### D. Touch ID / Face ID Unlock
1. Go to `Settings > Lock screen`.
2. Enable PIN lock (if not already enabled).
3. Enable `Unlock with Touch ID / Face ID`.
Expected: toggle can be enabled when device biometric is ready.

4. Background app and wait for auto-lock timeout.
5. Return to app.
Expected: biometric prompt appears and unlock succeeds.

6. Cancel biometric prompt or fail scan intentionally.
Expected: app falls back to PIN unlock path.

## 5) Quick Regression
- Login/logout still works.
- Bottom navigation works across Vault/Notes/Billing/Settings.
- No blocking crash during 10 minutes of normal usage.

## 6) Pass/Fail Gate
Release passes only if:
- All sections A-D pass.
- No crash, no data loss, no blocker.

## 7) Bug Report Template
- Device model:
- Android version:
- Scenario step number:
- Expected result:
- Actual result:
- Repro rate: `always / intermittent / once`
- Screenshot/video:
