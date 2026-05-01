# QA Execution Report Template

Project: Password Vault
Release Version: `v16.6.30`
Build Type: `APK` / `PWA`
Test Date (YYYY-MM-DD):
Tester Name:
Device Model:
OS Version:
App Build/URL:

## 1) Test Scope
- [ ] Bluetooth scan/connect/print (APK)
- [ ] Billing print flow
- [ ] Notes print flow
- [ ] PWA Print / Save PDF flow
- [ ] Regression smoke

## 2) Environment Details
- Network: Wi-Fi / 4G / 5G / Offline
- Printer Model:
- Printer Connection Type: Bluetooth
- Android SDK/API Level:
- Browser (for PWA):

## 3) Step-by-Step Results
| Step ID | Scenario | Expected Result | Actual Result | Status (PASS/FAIL/BLOCKED) | Evidence (Screenshot/Video/Log) | Notes |
|---|---|---|---|---|---|---|
| APK-01 | First open app on Android 12+ | Bluetooth permission prompt appears |  |  |  |  |
| APK-02 | Open Settings > Bluetooth Printer | Page opens without crash |  |  |  |  |
| APK-03 | Tap Scan | Printer list is returned |  |  |  |  |
| APK-04 | Select default printer | Success toast shown |  |  |  |  |
| APK-05 | Test print | Test slip printed |  |  |  |  |
| APK-06 | Billing print Bluetooth | Billing slip printed |  |  |  |  |
| APK-07 | Notes print Bluetooth | Note printed |  |  |  |  |
| APK-08 | Reopen app and print again | Saved printer still works |  |  |  |  |
| PWA-01 | Open Settings > Bluetooth Printer | Shows APK-only Bluetooth notice |  |  |  |  |
| PWA-02 | Billing print action | System print dialog opens |  |  |  |  |
| PWA-03 | Notes print action | System print dialog opens |  |  |  |  |
| PWA-04 | Save as PDF | PDF file generated correctly |  |  |  |  |
| REG-01 | Login/logout smoke | No regression |  |  |  |  |

## 4) Defect Log
| Bug ID | Severity (P0/P1/P2/P3) | Title | Repro Steps | Expected | Actual | Repro Rate | Owner | Status |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |

## 5) Summary
- Total Test Cases:
- Passed:
- Failed:
- Blocked:
- Pass Rate (%):

## 6) Release Recommendation
- [ ] GO
- [ ] NO-GO

Reason:

## 7) Sign-off
- QA Lead:
- Engineering Lead:
- Product Owner:
- Sign-off Date:
