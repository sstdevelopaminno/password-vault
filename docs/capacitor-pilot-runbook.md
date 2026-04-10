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
- Version under validation: `18.11.15`
