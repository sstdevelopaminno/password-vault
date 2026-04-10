# Mobile Runtime Test Results 17.10.14

## Scope
- Build version: `17.10.14`
- Runtime diagnostics endpoint: `/api/runtime/diagnostics`
- Checklist source: `docs/mobile-runtime-qa-checklist.md`

## Device Matrix
| Device | OS | Browser / Runtime | Install Mode | Result |
|---|---|---|---|---|
| Android Device A | Pending | Chrome | PWA | Pending |
| iPhone Device A | Pending | Safari | Home Screen | Pending |

## Android Chrome PWA
- Runtime chip shows `Android PWA`: Pending
- Runtime modal capability values are correct: Pending
- Update button appears after new deploy: Pending
- Update does not clear valid notification settings/state: Pending
- Offline fallback works: Pending
- Push tray + in-app heads-up both work: Pending
- UI control stability (menu/update/install buttons): Pending

## iPhone Safari Home Screen
- Runtime chip shows `iPhone Home Screen`: Pending
- Manual install hint appears before install and hides after install: Pending
- Update flow works after deploy: Pending
- Push and badge behavior recorded with iOS version: Pending
- UI control stability (menu/update/install buttons): Pending

## Runtime Diagnostics Event Comparison
| Event | Android | iPhone | Notes |
|---|---|---|---|
| runtime_boot | Pending | Pending |  |
| runtime_status_opened | Pending | Pending |  |
| runtime_visibility_change | Pending | Pending |  |
| runtime_install_prompt_available | Pending | Pending |  |
| runtime_installed | Pending | Pending |  |
| runtime_update_ready | Pending | Pending |  |
| runtime_update_applied | Pending | Pending |  |

## Thai i18n Validation
- Notification text rendered correctly in Thai: Pending
- Heads-up expand/collapse Thai labels rendered correctly: Pending
- No mojibake found in UI during flow tests: Pending

## Notes
- Fill this file after each real device run and keep screenshots/log links beside each row.
