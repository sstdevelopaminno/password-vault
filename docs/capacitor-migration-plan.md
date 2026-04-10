# Capacitor Migration Plan  
  
## Goal  
Reuse the current Next.js mobile web UI as much as possible, wrap it for Android and iOS stores, and progressively move hardware and OS integrations into native plugins.  
  
## Phase 1 - Stabilize PWA Runtime  
- Keep the current App Router app as the single source of UI and business logic.  
- Finish cache versioning, update prompts, offline fallback, and push stability on mobile web first.  
- Keep browser-safe APIs behind capability checks.  
  
## Phase 2 - Wrap with Capacitor  
- Add Capacitor config, Android project, and iOS project.  
- Use the existing web build as the rendered app shell.  
- Keep Supabase auth and current API routes unchanged at first.  
  
## Phase 3 - Move Native Features Behind Adapters  
- Notifications: browser push on web, native push plugin on store apps.  
- Badge: browser badging on supported PWAs, native badge plugin in Capacitor.  
- Secure storage: move sensitive local state from web storage to native secure storage where needed.  
- Biometrics and app-lock: expose a shared interface and branch by platform.  
  
## Phase 4 - Store Readiness  
- Add app icons, splash screens, privacy strings, deep links, and production signing.  
- Add background handling rules and QA matrices for Android and iOS.  
- Keep the web PWA path alive for browser users. 
