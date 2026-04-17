# Native Runtime Stability Runbook (PWA, TWA, Capacitor)

## 1) Target modes
- Web PWA mode: install from browser (Android/iOS Home Screen).
- Android native wrapper mode: Capacitor package now, TWA optional path.
- iOS native wrapper mode: Capacitor package.

This project keeps one web codebase and wraps it for native distribution.

## 2) Anti-stale version checklist
1. Ensure runtime version endpoint returns latest marker: `/api/version`.
2. Service worker cache must purge managed caches on update (`PURGE_APP_CACHE`).
3. Runtime must reconcile marker/schema on app resume and periodic checks.
4. If mismatch is detected, force SW update + cache purge + one safe reload.
5. Keep update button for manual recovery path in Settings/Toolbar.

## 3) Install flow checks
### Android (Chrome)
1. Open app in Chrome.
2. Verify `Install app` or `Add to Home screen` appears.
3. From in-app install button, verify prompt appears or fallback steps are shown.
4. Install and relaunch from icon.

### iOS (Safari)
1. Open app in Safari.
2. Tap Share -> Add to Home Screen.
3. Launch from icon and verify standalone mode.
4. Confirm install help card provides correct steps if no prompt exists.

## 4) Android 14+ validation
- Read Android major version from user agent.
- Mark runtime status as pass when version >= 14.
- Keep separate verification for WebView-based native wrapper.

## 5) iOS push validation (Home Screen, iOS 16.4+)
- Push for web app requires iOS 16.4+ and installed Home Screen mode.
- Runtime status should show:
  - unsupported (<16.4)
  - supported but not installed
  - ready (installed + supported)

## 6) Session stability checks
1. Login from browser tab.
2. Login from installed app icon.
3. Kill app and reopen from icon.
4. Ensure session cookie and active-session token are synchronized.
5. Ensure no stale cached HTML for authenticated routes.

## 7) Capacitor package commands
- Sync all: `npm run cap:sync`
- Android only: `npm run cap:sync:android`
- iOS only: `npm run cap:sync:ios`
- Open Android Studio: `npm run cap:open:android`
- Open Xcode: `npm run cap:open:ios`

## 8) Remote server wrapper mode (recommended)
Set these before sync so native app loads hosted web runtime:
- `CAPACITOR_SERVER_URL=https://<your-domain>`
- `CAPACITOR_ALLOW_NAVIGATION=<host1>,<host2>`

This avoids shipping stale `www` bundle as the only source of truth.

## 9) TWA path (optional)
If Android TWA is needed in addition to Capacitor:
1. Configure Digital Asset Links (`/.well-known/assetlinks.json`).
   This project serves the file from Next route: `src/app/.well-known/assetlinks.json/route.ts`.
   Set env values:
   - `ANDROID_TWA_PACKAGE_NAME` (default `com.passwordvault.app`)
   - `ANDROID_TWA_SHA256_FINGERPRINTS` (comma-separated SHA-256 fingerprints)
2. Keep `docs/twa-assetlinks.example.json` as the reference payload format.
3. Sign app with production keystore.
4. Validate verified origin and fallback behavior.
5. Keep the same update/caching policy on the web origin.
