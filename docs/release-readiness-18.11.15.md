# Release Readiness 20.13.17

## Summary Gate
- Overall release readiness: **NOT 100% yet**
- Reason: local quality gates are passing, but real-device checklist on Android/iPhone is still pending.

## Quality Gates
- `npm run lint`: PASS (0 errors, warnings remain)
- `npm run typecheck`: PASS
- `npm run build`: PASS (required non-sandbox run on this machine because sandbox returned `spawn EPERM`)

## Connectivity Checks
- GitHub remote (`git ls-remote origin refs/heads/main`): PASS
- Vercel auth/project (`npx vercel whoami`, `npx vercel projects ls`): PASS
- Supabase CLI + linked migrations (`npx supabase --version`, `npx supabase migration list --linked`): PASS

## Deploy Status
- Preview deploy: PASS  
  `https://password-vault-lnqqytn93-sstdevelopaminnos-projects.vercel.app`
- Production deploy: PASS  
  `https://password-vault-ivory.vercel.app`  
  Immutable URL: `https://password-vault-eqb8hvcgm-sstdevelopaminnos-projects.vercel.app`

## Runtime/Checklist Status
- Android Chrome PWA checklist: Pending real device run
- iPhone Safari Home Screen checklist: Pending real device run
- Runtime diagnostics capture and event comparison: Pending real device logs

## Platform Constraint (Vercel Hobby)
- Vercel Hobby does not allow sub-daily cron schedules.
- `vercel.json` push processor schedule was moved from `*/5 * * * *` to `0 3 * * *` so deploy can proceed.
- Near-real-time push still works on key flows that call `processPushQueue()` immediately after enqueue.

## Architecture Decision Status
1. PWA (fast app-like path): **Ready for deploy flow and QA on real devices**
2. Capacitor (Store + native features): **Pilot scaffold is ready; requires real-device validation next**
3. Fully native Android/iOS: **Not started, still a later architecture option**
