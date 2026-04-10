# Mobile Offline Sync E2E

Date: April 10, 2026  
Scope: Password Vault PWA/Capacitor runtime (`offline cache + queue + re-sync + PIN re-verify`)

## Goal
- Validate app behavior when internet is disconnected.
- Validate app behavior when backend API/database is unavailable.
- Validate queue recovery after reconnect.
- Validate locked queue unlock flow using 6-digit PIN in Sync Center.

## Prerequisites
- Build and run mobile app:
  - `npm run dev`
  - `npm run cap:sync:android` or `npm run cap:sync:ios`
- Sign in with a real user that has PIN already set.
- Open these pages at least once while online:
  - `/vault`
  - `/notes`
  - `/settings/sync`

## Case 1: Network Drop (Device Offline)
1. Open `/vault` and `/notes`, confirm data is visible.
2. Turn on airplane mode (or disable Wi-Fi/mobile data).
3. Confirm offline banner is shown.
4. Create a vault item.
5. Edit a vault item and delete another vault item.
6. Create/edit/delete note.
7. Open `/settings/sync` and verify:
  - Queue contains pending actions.
  - Items may show `Pending` tags in list UIs.

Expected:
- Reads come from local cache.
- Writes are queued, not lost.
- App stays usable without forced logout.

## Case 2: API/DB Outage (Online but Backend Down)
1. Keep internet ON.
2. Make backend unavailable (simulate by stopping server, or block API endpoint).
3. Open `/vault`, `/notes`, `/settings/sync`.
4. Perform create/edit/delete operations.

Expected:
- Outage mode is active even though device is online.
- Operations queue locally.
- Sync Center status shows backend unavailable.

## Case 3: Recovery and Auto Sync
1. Restore backend and network.
2. Wait for outage detector cycle (up to ~15 seconds) or press `Sync now` on `/settings/sync`.
3. Verify queue count decreases to zero.
4. Refresh `/vault` and `/notes`.

Expected:
- Queued operations are replayed.
- Server data reflects queued actions.
- `Pending` markers disappear after reload.
- Banner shows auto-sync progress while recovery is running.
- Sync Center shows last auto-sync timestamp and processed/failed counts.

## Case 3B: Built-in Recovery Self-Test
1. Open `/settings/sync`.
2. Press `Run offline recovery self-test`.
3. Wait for toast result (`passed`/`failed`).

Expected:
- Test queues a synthetic write, forces one simulated outage pass, then retries on recovery.
- A `passed` result means queue + retry + recovery flow is working.
- Queue returns to normal state after test.

## Case 4: Locked Queue Unlock (New Session)
1. Queue at least one action requiring PIN re-verify.
2. Close app fully and reopen (new session).
3. Go to `/settings/sync`.
4. If queue shows locked items, enter 6-digit PIN and press `Unlock`.
5. Press `Sync now`.

Expected:
- Locked items become unlocked after correct PIN.
- Sync completes for unlocked items.
- Wrong PIN does not unlock queue.

## Case 5: Retry and Backoff
1. Put 3-5 items in queue.
2. Introduce unstable backend (intermittent 5xx / 429 / timeout).
3. Trigger `Sync now`.

Expected:
- Each request retries with exponential backoff + jitter.
- Permanent failures stay in queue for next attempt.
- UI shows processed vs failed counts.

## Regression Checklist
- PIN modal still works for online secure actions.
- User can still navigate all tabs while offline.
- No crash when queue is empty.
- No crash when queue contains mixed feature actions (`vault`, `notes`).
- TypeScript and lint pass:
  - `npx tsc -p tsconfig.json --noEmit`
  - `npm run lint`
