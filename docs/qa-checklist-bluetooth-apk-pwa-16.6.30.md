# QA Checklist: Bluetooth Print (APK) + Print/PDF (PWA) — v16.6.30

Date: 2026-05-01
Scope: Verify fix for "connected but cannot discover / cannot print" and verify expected behavior split between APK and PWA.

## 1) Test Matrix (Quick)
- Android APK: Bluetooth scan + connect + test print + real print
- Android PWA (Chrome install): Print / Save PDF flow
- Desktop Browser: Print / Save PDF flow

## 2) Preconditions
- Test printer is powered on, paired at OS level (Android Bluetooth settings), and has paper.
- APK under test is `vault-v16.6.30.apk`.
- Web under test is latest deployment URL.
- Test account can access Billing and Notes pages.

## 3) APK Checklist (Must Pass)
1. Fresh install APK `v16.6.30`.
Expected: App opens normally.

2. On first app open, allow Bluetooth permissions (`Nearby devices` / Bluetooth).
Expected: Permission prompt appears at least once on Android 12+.

3. Open `Settings > Bluetooth Printer`.
Expected: Page loads without crash.

4. Tap `Scan`.
Expected: Nearby/paired printer list appears.

5. Select one printer.
Expected: Toast shows default printer is set.

6. Tap `Test print`.
Expected: Printer prints test receipt; toast success.

7. Open Billing document detail and tap `Print Bluetooth`.
Expected: Real document prints successfully.

8. Open Notes and use `Print Bluetooth`.
Expected: Note content prints successfully.

9. Kill app fully, reopen, and print again.
Expected: Previously selected printer persists and can print.

10. Negative test: deny Bluetooth permission then scan.
Expected: Clear error message shown, no app crash.

## 4) PWA Checklist (Expected Behavior)
1. Open app as PWA (Android Chrome installed) and login.
Expected: App works normally.

2. Open `Settings > Bluetooth Printer`.
Expected: Message explains Bluetooth setup is APK-only and PWA uses system print dialog.

3. From Billing detail, tap print action.
Expected: System print dialog opens (`Print / Save PDF`).

4. From Notes, tap print/PDF action.
Expected: System print dialog opens (`Print / Save PDF`).

5. Save as PDF.
Expected: File is generated correctly with readable content.

## 5) Regression Quick Checks
- Login / Logout still works.
- No blocking console/runtime errors on Billing/Notes/Settings pages.
- Android back button behavior still normal.

## 6) Pass/Fail Gate
Release can proceed only if:
- APK section: all 10 steps pass.
- PWA section: all 5 steps pass.
- No crash, no blocker, no data corruption.

## 7) Bug Report Template (QA)
- Environment: `APK v16.6.30` or `PWA` + device model + Android version
- Step number:
- Actual result:
- Expected result:
- Screenshot/video:
- Repro rate: `always / intermittent / once`
