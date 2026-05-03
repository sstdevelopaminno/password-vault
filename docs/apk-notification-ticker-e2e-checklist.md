# APK Notification + Ticker E2E Checklist

Date: 2026-05-03  
App: `vault-v16.6.33.apk`

## Pre-check

1. Install APK:
   - `adb install -r android/app/build/outputs/apk/release/app-release.apk`
2. Open app and login.
3. Confirm notification permissions are enabled:
   - App settings: `Settings > Notification Settings`
   - Android OS settings: App notifications = ON
4. For Android 12+ turn on exact alarm:
   - In app: `Settings > Notification Settings > Configure exact alarm timing`
5. Confirm network is available.

## Flow A: Note reminder ticker (foreground)

1. Open `Notes`.
2. Tap `Create Note`.
3. Enter title/content.
4. Set reminder time to now + 1-2 minutes.
5. Save.
6. Keep app in foreground on Notes page.
7. Wait until due time.

Expected:
- In-app ticker popup appears with note title.
- Optional OS local notification appears.

## Flow B: Note reminder in background/locked screen

1. Create another note reminder for now + 2 minutes.
2. Press Home (app in background) or lock screen.
3. Wait until due time.

Expected:
- OS notification appears from app.
- Tapping notification opens app to notes context.

## Flow C: Meeting time reminder

1. Create note with meeting date/time = now + 1-2 minutes.
2. Repeat foreground and background checks.

Expected:
- Reminder title indicates meeting reminder.
- Deep-link returns to notes flow.

## Stability checks (notes)

1. Edit note and move reminder to new time.
2. Ensure old schedule is cancelled.
3. Delete note before due time.
4. Ensure no stale reminder fires.

## Other notification systems

1. Go to `Settings > Notification Settings`.
2. Tap `Test in-app popup`.
   - Expect heads-up popup.
3. Tap `Test background push`.
   - Expect server push/in-app delivery (if push is configured).
4. Toggle categories ON/OFF and re-test.
   - Expect blocked categories not shown.

## Reliability matrix

Run Flow A/B/C in these states:
- Wi-Fi ON / OFF
- Battery saver ON / OFF
- Doze/idle after screen off 5+ minutes
- App force-stopped then reopened
- Device rebooted

Expected:
- Notifications still fire (allow small delay when exact alarm is disabled).

## Quick diagnostics commands

1. Device list:
   - `adb devices -l`
2. Notification-related logs:
   - `adb logcat | findstr /i "capacitor localnotification notification alarm"`
3. App process:
   - `adb shell pidof com.passwordvault.app`

## Pass criteria

- Note ticker appears at due time in foreground.
- Local notification appears in background/lock state.
- Reschedule/delete behavior has no stale alerts.
- Test push endpoint shows successful delivery path.
- No crash/ANR during repeated reminder cycles.
