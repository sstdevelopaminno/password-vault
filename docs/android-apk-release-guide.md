# Android APK Release Guide (Capacitor)

Goal: use the same web codebase and distribute a real Android APK that users can download and install manually.

## Prerequisites (Windows)
- Android SDK installed (for example `C:\Users\<you>\AppData\Local\Android\Sdk`)
- JDK 21 (Capacitor Android 8 requires Java 21 for release build)
- Recommended:
  - keep a local portable JDK 21 under `tools/jdk21/`
  - use `npm run apk:android:release` (script auto-detects JDK/SDK)

## 1) Keep upgrade compatibility
- Keep `applicationId` / package name unchanged: `com.passwordvault.app`
- Keep signing key unchanged across every release
- Increase `versionCode` on every release
- Update `versionName` to match your release (current baseline: `16.6.3`)

This project already sets:
- `android/app/build.gradle`
  - `versionCode 16603`
  - `versionName "16.6.3"`

Signing env for release output:
- `ANDROID_RELEASE_KEYSTORE`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_PASSWORD`

## 2) Build release APK
1. Install/update dependencies:
   - `npm install`
2. Build APK:
   - `npm run apk:android:release`
3. Output path:
   - `android/app/build/outputs/apk/release/app-release.apk` (signed when signing env is configured)

## 3) Publish APK for user download
Choose one channel:
- Domain/CDN path: for example `https://password-vault-ivory.vercel.app/apk/vault-v16.6.3.apk`
- GitHub Releases asset

Then set environment values (see `.env.example`):
- `NEXT_PUBLIC_ANDROID_APK_VERSION`
- `NEXT_PUBLIC_ANDROID_APK_VERSION_CODE`
- `NEXT_PUBLIC_ANDROID_APK_URL`
- `NEXT_PUBLIC_ANDROID_APK_PACKAGE_NAME`
- `NEXT_PUBLIC_ANDROID_APK_SIGNING_SHA256`
- `ANDROID_APK_TRUSTED_PACKAGE_NAME`
- `ANDROID_APK_TRUSTED_SIGNING_SHA256`

## 4) Runtime behavior in app
- Android (non-iOS) users:
  - Landing page shows APK download button
  - Logged-in users get update popup for new APK versions
  - Current support baseline: Android 7.0+ (API 24)
  - Recommended for high stability: Android 10+ (API 29+)
- iOS users:
  - APK button/popup is hidden
  - Continue using PWA flow

## 5) Face scan stability checks
- Android manifest includes camera permission:
  - `android.permission.CAMERA`
- iOS `Info.plist` includes:
  - `NSCameraUsageDescription`
- UI now maps camera errors to clear reasons:
  - permission denied
  - camera busy
  - camera not found
  - unsupported device/browser
