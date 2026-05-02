# Release Notes - v16.6.31 UI Hotfix (May 2, 2026)

## Scope
- Restored Thai text rendering on user settings screens.
- Tuned settings layout top spacing for safer mobile safe-area breathing room.
- Adjusted default display scale to `standard` (balanced) so UI is not oversized by default.
- Synced local runtime env version values to APK `16.6.31`.

## Updated Files
- `src/app/(user)/settings/page.tsx`
- `src/app/(user)/settings/lock-screen/page.tsx`
- `src/lib/display-scale.tsx`
- `.env.local` (local environment only)

## UX / i18n Notes
- Verified Thai/English toggle logic remains active through `useI18n`.
- Cleared mojibake strings on Settings and Lock Screen menus/forms.
- Increased top safe-area spacing from `+10px` to `+18px` on settings-related pages.

## Risk
- Low risk; this patch is text/layout/default-preference focused with no database schema changes.
