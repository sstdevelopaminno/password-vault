import type { SupabaseClient, User } from '@supabase/supabase-js';

export type MdmEnrollmentState = 'enrolled' | 'pending' | 'not_enrolled' | 'unknown';
export type MdmComplianceState = 'compliant' | 'at_risk' | 'non_compliant' | 'unknown';
export type MdmActionName = 'sync_policy' | 'recheck_compliance' | 'enroll_device';

type AuditLogRow = {
  action_type: string;
  created_at: string;
  metadata_json: Record<string, unknown> | null;
};

const MDM_ACTION_TYPES = [
  'mdm_action_sync_policy',
  'mdm_action_recheck_compliance',
  'mdm_action_enroll_device',
  'mdm_enrollment_state_set',
  'mdm_compliance_state_set',
  'vault_risk_assessed',
] as const;

function normalizeHttpUrl(value: string) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function asNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeEnrollmentState(value: unknown): MdmEnrollmentState {
  const text = String(value ?? '').trim().toLowerCase();
  if (['enrolled', 'managed', 'active', 'true'].includes(text)) return 'enrolled';
  if (['pending', 'invited', 'provisioning', 'enrolling'].includes(text)) return 'pending';
  if (['not_enrolled', 'not-enrolled', 'none', 'inactive', 'false', 'unenrolled'].includes(text)) return 'not_enrolled';
  return 'unknown';
}

function normalizeComplianceState(value: unknown): MdmComplianceState {
  const text = String(value ?? '').trim().toLowerCase();
  if (['compliant', 'pass', 'ok', 'healthy'].includes(text)) return 'compliant';
  if (['at_risk', 'at-risk', 'warning', 'warn', 'medium'].includes(text)) return 'at_risk';
  if (['non_compliant', 'non-compliant', 'fail', 'failed', 'critical', 'high_risk'].includes(text)) return 'non_compliant';
  return 'unknown';
}

function defaultComplianceFromRisk(score: number): MdmComplianceState {
  if (score >= 70) return 'non_compliant';
  if (score >= 35) return 'at_risk';
  return 'compliant';
}

function defaultPolicies(state: MdmComplianceState) {
  const compliant = state === 'compliant';
  const atRisk = state === 'at_risk';
  const nonCompliant = state === 'non_compliant';
  const status = compliant ? 'pass' : atRisk ? 'warn' : nonCompliant ? 'fail' : 'unknown';
  return [
    {
      id: 'device_integrity',
      name: 'Device integrity',
      status,
      note: compliant
        ? 'Device integrity checks passed'
        : atRisk
          ? 'Device integrity has warning signals'
          : nonCompliant
            ? 'Integrity checks failed and needs remediation'
            : 'Integrity state is not available',
    },
    {
      id: 'threat_apps',
      name: 'Threat app scan',
      status: compliant ? 'pass' : atRisk ? 'warn' : 'fail',
      note: compliant
        ? 'No high-risk app signal detected'
        : atRisk
          ? 'Suspicious app signals detected'
          : 'High-risk app behavior requires immediate action',
    },
    {
      id: 'network_policy',
      name: 'Network policy',
      status: nonCompliant ? 'fail' : atRisk ? 'warn' : 'pass',
      note: nonCompliant
        ? 'Network trust policy failed'
        : atRisk
          ? 'Network policy has warning signals'
          : 'Network policy checks passed',
    },
  ];
}

function findLatest(rows: AuditLogRow[], actionType: string) {
  return rows.find((row) => row.action_type === actionType) ?? null;
}

function riskSummaryFromState(state: MdmComplianceState, score: number) {
  if (state === 'compliant') return `Device meets policy baseline (risk score ${score}/100)`;
  if (state === 'at_risk') return `Device needs review (risk score ${score}/100)`;
  if (state === 'non_compliant') return `Device is outside policy threshold (risk score ${score}/100)`;
  return `Risk state is pending evaluation (risk score ${score}/100)`;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      payload: { error: error instanceof Error ? error.message : 'Upstream request failed' },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getUpstreamHeaders(user: User) {
  const token = String(process.env.MDM_UPSTREAM_BEARER_TOKEN ?? '').trim();
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'x-user-id': user.id,
    'x-user-email': String(user.email ?? ''),
  };
}

export async function requestUpstreamMdmOverview(user: User) {
  const url = normalizeHttpUrl(String(process.env.MDM_OVERVIEW_UPSTREAM_URL ?? ''));
  if (!url) return null;
  return fetchJsonWithTimeout(
    url,
    {
      method: 'GET',
      headers: getUpstreamHeaders(user),
    },
    10000,
  );
}

export async function requestUpstreamMdmAction(user: User, action: MdmActionName) {
  const url = normalizeHttpUrl(String(process.env.MDM_ACTION_UPSTREAM_URL ?? ''));
  if (!url) return null;
  return fetchJsonWithTimeout(
    url,
    {
      method: 'POST',
      headers: getUpstreamHeaders(user),
      body: JSON.stringify({ action }),
    },
    12000,
  );
}

export async function listMdmAuditRows(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('audit_logs')
    .select('action_type,created_at,metadata_json')
    .eq('actor_user_id', userId)
    .in('action_type', [...MDM_ACTION_TYPES])
    .order('created_at', { ascending: false })
    .limit(120);
  return (data ?? []) as AuditLogRow[];
}

export async function writeMdmAudit(
  supabase: SupabaseClient,
  userId: string,
  actionType: string,
  metadata: Record<string, unknown>,
) {
  const payload = {
    actor_user_id: userId,
    action_type: actionType,
    metadata_json: metadata,
  };
  await supabase.from('audit_logs').insert(payload);
}

export function buildLocalMdmOverview(user: User, rows: AuditLogRow[]) {
  const provider = String(process.env.MDM_PROVIDER_NAME ?? 'Vault MDM').trim() || 'Vault MDM';
  const portalUrl = normalizeHttpUrl(String(process.env.MDM_PORTAL_URL ?? ''));
  const enrollmentUrl = normalizeHttpUrl(String(process.env.MDM_ENROLLMENT_URL ?? ''));
  const nowIso = new Date().toISOString();

  const riskRow = findLatest(rows, 'vault_risk_assessed');
  const riskScore = Math.max(0, Math.min(100, asNumber(riskRow?.metadata_json?.score, 0)));
  const riskSeverity = asString(riskRow?.metadata_json?.severity, '').toLowerCase();

  const explicitCompliance = normalizeComplianceState(findLatest(rows, 'mdm_compliance_state_set')?.metadata_json?.state);
  const derivedCompliance = defaultComplianceFromRisk(riskScore);
  const complianceState =
    explicitCompliance !== 'unknown'
      ? explicitCompliance
      : riskSeverity === 'critical' || riskSeverity === 'high'
        ? 'non_compliant'
        : riskSeverity === 'medium'
          ? 'at_risk'
          : derivedCompliance;

  const explicitEnrollment = normalizeEnrollmentState(findLatest(rows, 'mdm_enrollment_state_set')?.metadata_json?.state);
  const enrollAction = findLatest(rows, 'mdm_action_enroll_device');
  const enrollmentState =
    explicitEnrollment !== 'unknown'
      ? explicitEnrollment
      : enrollAction
        ? normalizeEnrollmentState(enrollAction.metadata_json?.enrollmentState ?? 'pending')
        : 'not_enrolled';

  const syncRow = findLatest(rows, 'mdm_action_sync_policy') ?? findLatest(rows, 'mdm_action_recheck_compliance');
  const lastPolicySyncAt = syncRow?.created_at ?? null;
  const lastSeenAt = nowIso;

  const deviceName = String(process.env.MDM_DEVICE_NAME_DEFAULT ?? 'Current device').trim() || 'Current device';
  const platform = String(process.env.MDM_PLATFORM_DEFAULT ?? 'unknown').trim().toLowerCase() || 'unknown';
  const deviceId = `user-${user.id.slice(0, 8)}`;

  return {
    provider,
    deviceName,
    deviceId,
    platform,
    enrollmentState,
    complianceState,
    lastSeenAt,
    lastPolicySyncAt,
    riskScore,
    riskSummary: riskSummaryFromState(complianceState, riskScore),
    enrollmentUrl,
    portalUrl,
    policies: defaultPolicies(complianceState),
    source: 'local_fallback',
  };
}
