# Chrome Android Performance Profiling Checklist

## 1) Test Scope
- Runtime A: Chrome Android browser tab.
- Runtime B: Installed PWA (standalone mode).
- Build type: production build (`npm run build` + `npm run start`).
- Network profiles to test: Wi-Fi stable and 4G throttled.

## 2) Device Matrix
- At least 3 Android devices (low, mid, high performance class).
- Chrome version must be recorded for each device.
- Record RAM and Android OS version per device.

## 3) One-Time Setup (Local Machine)
1. Enable `Developer options` and `USB debugging` on Android.
2. Connect phone to laptop via USB.
3. On laptop, verify device: `adb devices`.
4. Open desktop Chrome: `chrome://inspect/#devices`.
5. Open app on phone (tab mode or installed PWA), then click `inspect` from desktop Chrome.

## 4) Repro Flow (Use Exactly This Flow)
1. Launch app from cold start.
2. Login with valid account.
3. Navigate: Home -> Notes -> Vault -> Org Shared -> Settings.
4. Trigger one in-app notification popup and swipe to dismiss.
5. Return to Home and idle for 15 seconds.

## 5) FPS Measurement (Step-by-step)
1. In DevTools (remote target), open `More tools` -> `Performance monitor`.
2. Keep `FPS` and `JS heap size` visible.
3. Run the repro flow once.
4. Capture min/avg FPS during scroll and page transitions.

Pass criteria:
- Avg FPS >= 50 on mid-tier device.
- Min FPS should not stay below 30 for more than 1 second.

## 6) Long Task Measurement (Step-by-step)
1. Open DevTools `Performance` panel.
2. Enable `Screenshots` and `Web Vitals`.
3. Click `Record`, run the full repro flow, then stop recording.
4. In `Main` thread lane, inspect tasks longer than 50ms.
5. Count long tasks and note the heaviest script/function.

Pass criteria:
- No single long task > 200ms during normal navigation.
- Total long tasks (>50ms) should trend down between releases.

## 7) CLS Measurement (Step-by-step)
1. In the same `Performance` trace, inspect `Layout Shifts` in `Web Vitals` lane.
2. Click each layout shift marker and map to the UI element that moved.
3. Sum CLS for the flow.

Pass criteria:
- CLS <= 0.10 for the complete repro flow.
- No major layout jump on bottom nav, toast, or login view.

## 8) Login Stability and Speed Checks
1. Throttle network to Fast 3G once, then run login.
2. Simulate flaky network once (offline -> online) and retry login.
3. Confirm spinner never hangs indefinitely.
4. Confirm login either succeeds quickly or fails with clear error state.

Pass criteria:
- Login request should resolve (success/fail) within timeout budget.
- No stuck loading state after timeout/network interruption.
- Retry path works once without duplicate side effects.

## 9) Nightly Maintenance Window Verification (23:30-01:00)
1. Set device time into maintenance window for test.
2. Open app and observe one maintenance cycle.
3. Confirm managed caches are purged and app reloads once.
4. Re-open app in same window and confirm it does not loop reload.

Expected runtime diagnostics events:
- `runtime_nightly_maintenance_start`
- `runtime_nightly_maintenance_complete`

## 10) PWA Stability Verification
1. Install PWA from Chrome.
2. Launch from home screen icon (standalone).
3. Repeat repro flow in standalone mode.
4. Lock/unlock screen and resume app.
5. Verify app recovers without white screen or frozen bottom navigation.

Pass criteria:
- No crash/freeze after background-resume.
- Navigation and notifications stay responsive.
- Offline fallback is still reachable when network drops.

## 11) Report Template (Per Device)
- Device model:
- Android version:
- Chrome version:
- Runtime mode (Tab/PWA):
- Avg FPS / Min FPS:
- Long tasks count and max duration:
- CLS score:
- Login duration (cold/warm):
- Result: PASS or FAIL
- Notes and trace link:
