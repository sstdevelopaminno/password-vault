# Vault Shield: Risk Score + Response Matrix (Android APK Ready Spec)

Last updated: 2026-04-18

## Scope
- Target runtime: Android native APK (Capacitor)
- Goal: detect risky device/app/network conditions and automatically apply Vault Response controls
- Out of scope: force-uninstall third-party apps (user must uninstall manually)

## Implemented Pipeline
1. Android native collects signals via `VaultShieldPlugin.collectSignals()`.
2. Android native also requests Play Integrity token (`requestIntegrityToken`) using nonce + cloud project number.
3. Client sentinel (`VaultRiskSentinel`) posts snapshot + Play Integrity token to `POST /api/security/risk-evaluate`.
4. Server decodes/verifies Play Integrity token against Google Play Integrity API and maps verdict to risk score.
5. Server computes score/severity/actions via `evaluateVaultRisk()`.
6. Server sets risk policy cookie (`pv_risk_policy_v1`) with TTL.
7. `src/proxy.ts` enforces policy on API/page access.
8. Settings page `/settings/risk-state` reads `GET /api/security/risk-state` for current policy and latest details.

## Signal Model
- Device trust:
  - `suBinaryDetected`, `hasTestKeys`, `isEmulator`, `isDebuggable`, `developerOptionsEnabled`, `adbEnabled`
  - `playIntegrityVerdict` (derived from verified Play Integrity token)
- App risk:
  - `suspiciousApps[]`, `suspiciousAppCount`
  - `installSource` vs `expectedInstallSource`
  - `packageVisibilityLimited`, `queryAllPackagesDeclared`
- Network/link risk:
  - `vpnActive`, `proxyDetected`, `insecureTransport`, `knownMaliciousDomainHit`
  - `phishingDomainMatched`, `dangerousDeepLinkMatched`

## Risk Score Thresholds
- `low`: `0-29`
- `medium`: `30-54`
- `high`: `55-79`
- `critical`: `80+`

## Response Matrix
| Severity | Actions | Policy TTL | Lock Duration |
|---|---|---:|---:|
| `low` | none (or notify+uninstall suggestion if risky apps detected) | 5 min | 0 |
| `medium` | `notify_user`, `limit_sensitive_actions`, `suggest_uninstall_risky_apps`* | 10 min | 0 |
| `high` | `notify_user`, `force_reauth`, `limit_sensitive_actions`, `block_sensitive_data`, `block_sync`, `suggest_uninstall_risky_apps`* | 20 min | 5 min |
| `critical` | `notify_user`, `force_reauth`, `limit_sensitive_actions`, `block_sensitive_data`, `block_sync`, `lock_vault_temporarily`, `suggest_uninstall_risky_apps`* | 30 min | 20 min |

`*` included when suspicious apps are detected.

## Enforcement Rules (Current)
- `force_reauth`:
  - proxy clears session cookies and blocks non-auth APIs with `401 RISK_REAUTH_REQUIRED`
  - page traffic redirects to `/login?risk=reauth`
- `block_sensitive_data`:
  - blocks secret-read endpoints with `423 RISK_SENSITIVE_DATA_BLOCKED`
- `block_sync`:
  - blocks vault/team/notes sync APIs with `423 RISK_SYNC_BLOCKED`
- `lock_vault_temporarily`:
  - blocks vault APIs with `423 RISK_VAULT_LOCKED`
  - redirects vault pages to `/home?risk=locked`

## Android Manifest + Plugin Notes
- Added launcher-query visibility on Android 11+:
  - `<queries><intent ACTION_MAIN + CATEGORY_LAUNCHER /></queries>`
- Added `ACCESS_NETWORK_STATE` for VPN-state signal.
- No default `QUERY_ALL_PACKAGES` in this phase (safer for Play policy).

## Play Integrity Configuration
- Client env:
  - `NEXT_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER`
- Server env:
  - `PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER`
  - `PLAY_INTEGRITY_PACKAGE_NAME`
  - `PLAY_INTEGRITY_SERVICE_ACCOUNT_EMAIL`
  - `PLAY_INTEGRITY_SERVICE_ACCOUNT_PRIVATE_KEY`
  - `PLAY_INTEGRITY_ALLOWED_TOKEN_AGE_SEC`
- Verification behavior:
  - checks nonce match, package match, and token freshness
  - maps `MEETS_STRONG_INTEGRITY` / `MEETS_DEVICE_INTEGRITY` / `MEETS_BASIC_INTEGRITY`
  - any mismatch or unrecognized app -> `failed`

## Phase 2 (Next Immediate Tasks)
1. Add server-side threat feed check for malicious package/domain indicators.
2. Add admin dashboard widget for risk events from `audit_logs` (`action_type = vault_risk_assessed`).
3. Add policy acknowledgment flow and secure remediation checklist tracking.
4. Add background re-check trigger on critical app events (open vault secret, export).
