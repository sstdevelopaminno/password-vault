# Capacitor Pilot Runbook

Goal: wrap the hosted Next.js app first and keep the current web flow unchanged.

## Pilot assumptions
- Keep the app hosted on Vercel during the pilot.
- Use remote server mode first so SSR and current API routes stay unchanged.
- Add native plugins later for push, badge, secure storage, and biometrics.

## Next steps
- Install @capacitor/core and @capacitor/cli.
- Set CAPACITOR_SERVER_URL to the preview or production URL used for the pilot.
- Run npx cap add android and npx cap add ios after CLI auth is working.
- Validate login, vault read, update flow, push, and offline behavior inside the wrapper.

## Current pilot value
- CAPACITOR_SERVER_URL target: `https://password-vault-ivory.vercel.app`
- Verified preview build for this round: `https://password-vault-lnqqytn93-sstdevelopaminnos-projects.vercel.app`
- Version under validation: `V16.6.3`

## Packaging command sequence
1. Set env for remote runtime:
   - `CAPACITOR_SERVER_URL=https://password-vault-ivory.vercel.app`
   - `CAPACITOR_ALLOW_NAVIGATION=phswnczojmrdfioyqsql.supabase.co,password-vault-ivory.vercel.app`
2. Run sync:
   - `npm run cap:sync`
3. Open platform projects:
   - `npm run cap:open:android`
   - `npm run cap:open:ios`

## Known risk to avoid
- If native package points only to local `www` bundle, users can stay on old UI after web deploy.
- Keep remote server mode for pilot, then use runtime marker/schema reconciliation for forced refresh on update.
