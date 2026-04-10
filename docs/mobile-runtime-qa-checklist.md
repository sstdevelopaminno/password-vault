# Mobile Runtime QA Checklist

## Preconditions
- HTTPS deploy is available on Vercel.
- Test accounts exist for Android Chrome and iPhone Safari.
- Server logs can be inspected for runtime-diagnostics events.
- Use build `18.11.15` for this round.

## Deploy targets for this round
- Preview: `https://password-vault-lnqqytn93-sstdevelopaminnos-projects.vercel.app`
- Production alias: `https://password-vault-ivory.vercel.app`
- Production immutable URL: `https://password-vault-eqb8hvcgm-sstdevelopaminnos-projects.vercel.app`

## Runtime log capture procedure (run during each device test)
1. Start log capture:
   `npx vercel logs https://password-vault-ivory.vercel.app --json`
2. Keep the terminal open while testing one device flow.
3. Stop capture after the flow completes and save output to a per-device file:
   `runtime-logs-android-<date>.jsonl` or `runtime-logs-ios-<date>.jsonl`
4. Extract `[runtime-diagnostics]` lines and map to events in test-results doc.

## Android Chrome PWA
- Install from Chrome and confirm the runtime chip shows Android PWA.
- Deploy a new build and confirm Update appears without clearing notification settings.
- Go offline and confirm the cached shell or offline page still opens.
- Send a push event and confirm tray plus in-app behavior.

## iPhone Home Screen
- Install from Safari to the home screen and confirm the runtime chip shows iPhone Home Screen.
- Confirm manual install guidance disappears after install and update flow still works after deploy.
- Record the exact iOS version because push and badge support may vary.

## Telemetry to confirm
- runtime_boot, runtime_status_opened, runtime_update_ready, runtime_update_applied.
- runtime_install_prompt_available, runtime_installed, runtime_visibility_change.
