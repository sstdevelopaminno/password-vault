export type MdmEnrollmentState = 'enrolled' | 'pending' | 'not_enrolled' | 'unknown';
export type MdmComplianceState = 'compliant' | 'at_risk' | 'non_compliant' | 'unknown';

export type MdmPolicyItem = {
  id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
  note?: string;
};

export type MdmOverview = {
  provider: string;
  deviceName: string;
  deviceId?: string;
  platform?: string;
  enrollmentState: MdmEnrollmentState;
  complianceState: MdmComplianceState;
  lastSeenAt: string | null;
  lastPolicySyncAt: string | null;
  riskScore: number;
  riskSummary: string;
  enrollmentUrl?: string;
  portalUrl?: string;
  policies: MdmPolicyItem[];
  raw?: unknown;
};

export type MdmActionName = 'sync_policy' | 'recheck_compliance' | 'enroll_device';

export type MdmActionResult = {
  message: string;
  enrollmentUrl?: string;
  raw: Record<string, unknown>;
};

type MdmSchemaMap = {
  overviewContainerPaths: string[];
  fields: {
    provider: string[];
    deviceName: string[];
    deviceId: string[];
    platform: string[];
    enrollmentState: string[];
    complianceState: string[];
    lastSeenAt: string[];
    lastPolicySyncAt: string[];
    riskScore: string[];
    riskSummary: string[];
    enrollmentUrl: string[];
    portalUrl: string[];
    policies: string[];
  };
  policyItem: {
    id: string[];
    name: string[];
    status: string[];
    note: string[];
  };
  actionResult: {
    message: string[];
    enrollmentUrl: string[];
  };
};

const DEFAULT_SCHEMA: MdmSchemaMap = {
  overviewContainerPaths: [
    'overview',
    'data.overview',
    'data.mdm',
    'data.deviceManagement',
    'data.device_management',
    'result.overview',
    'result.mdm',
    'mdm',
    'deviceManagement',
    'device_management',
  ],
  fields: {
    provider: ['provider', 'providerName', 'vendor', 'tenant'],
    deviceName: ['deviceName', 'device_name', 'displayName', 'name', 'hostname'],
    deviceId: ['deviceId', 'device_id', 'id', 'managedDeviceId'],
    platform: ['platform', 'os', 'osName', 'operatingSystem'],
    enrollmentState: ['enrollmentState', 'enrollment_state', 'enrollmentStatus', 'managementState'],
    complianceState: ['complianceState', 'compliance_state', 'complianceStatus', 'status', 'riskLevel'],
    lastSeenAt: ['lastSeenAt', 'last_seen_at', 'lastCheckInAt', 'last_check_in_at', 'updatedAt', 'updated_at'],
    lastPolicySyncAt: ['lastPolicySyncAt', 'last_policy_sync_at', 'policySyncedAt', 'policy_synced_at'],
    riskScore: ['riskScore', 'risk_score', 'score', 'securityScore', 'threatScore'],
    riskSummary: ['riskSummary', 'risk_summary', 'summary', 'riskMessage', 'message'],
    enrollmentUrl: ['enrollmentUrl', 'enrollment_url', 'enrollUrl', 'enroll_url', 'enrollmentLink'],
    portalUrl: ['portalUrl', 'portal_url', 'dashboardUrl', 'dashboard_url'],
    policies: ['policies'],
  },
  policyItem: {
    id: ['id', 'policy_id', 'key', 'code'],
    name: ['name', 'title', 'policy_name', 'label'],
    status: ['status', 'result', 'state', 'compliance'],
    note: ['note', 'message', 'reason', 'detail', 'details'],
  },
  actionResult: {
    message: ['message', 'detail', 'result.message', 'data.message'],
    enrollmentUrl: ['enrollmentUrl', 'enrollment_url', 'url', 'link', 'data.enrollmentUrl', 'data.url'],
  },
};

const PROFILE_INTUNE: Partial<MdmSchemaMap> = {
  overviewContainerPaths: ['value.0', 'data.value.0', 'overview', 'data.overview'],
  fields: {
    provider: ['provider', 'vendor', 'tenant'],
    deviceName: ['deviceName', 'displayName', 'device_name'],
    deviceId: ['managedDeviceId', 'id', 'deviceId'],
    platform: ['operatingSystem', 'platform', 'os'],
    enrollmentState: ['managementState', 'enrollmentState', 'enrollmentStatus'],
    complianceState: ['complianceState', 'complianceStatus', 'status'],
    lastSeenAt: ['lastSyncDateTime', 'lastSeenAt', 'updatedDateTime'],
    lastPolicySyncAt: ['lastSyncDateTime', 'lastPolicySyncAt'],
    riskScore: ['riskScore', 'score'],
    riskSummary: ['riskSummary', 'summary', 'message'],
    enrollmentUrl: ['enrollmentUrl', 'enrollment_link', 'data.enrollmentUrl'],
    portalUrl: ['portalUrl', 'dashboardUrl'],
    policies: ['deviceCompliancePolicyStates', 'policies'],
  },
  policyItem: {
    id: ['id', 'policyId', 'policy_id'],
    name: ['displayName', 'name', 'policy_name'],
    status: ['state', 'status'],
    note: ['settingStates', 'message', 'detail'],
  },
};

const PROFILE_JAMF: Partial<MdmSchemaMap> = {
  overviewContainerPaths: ['device', 'data.device', 'overview', 'data.overview'],
  fields: {
    provider: ['provider', 'vendor'],
    deviceName: ['general.name', 'deviceName', 'name'],
    deviceId: ['general.id', 'id', 'deviceId'],
    platform: ['hardware.os_name', 'platform', 'osName'],
    enrollmentState: ['management.enrollmentState', 'enrollmentState'],
    complianceState: ['management.complianceState', 'complianceState', 'status'],
    lastSeenAt: ['general.last_contact_time', 'lastSeenAt', 'updatedAt'],
    lastPolicySyncAt: ['management.last_policy_sync_at', 'lastPolicySyncAt'],
    riskScore: ['risk.score', 'riskScore', 'score'],
    riskSummary: ['risk.summary', 'riskSummary', 'message'],
    enrollmentUrl: ['management.enrollment_url', 'enrollmentUrl'],
    portalUrl: ['portalUrl', 'dashboardUrl'],
    policies: ['management.policies', 'policies'],
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readPath(source: unknown, path: string): unknown {
  const keys = path.split('.').filter(Boolean);
  let cursor: unknown = source;
  for (const key of keys) {
    const current = asRecord(cursor);
    if (!(key in current)) return undefined;
    cursor = current[key];
  }
  return cursor;
}

function pickFirst(source: unknown, paths: string[], fallback?: unknown): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return fallback;
}

function parseSchemaOverride(raw: string): Partial<MdmSchemaMap> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<MdmSchemaMap>;
  } catch {
    return null;
  }
}

function mergeSchema(base: MdmSchemaMap, patch?: Partial<MdmSchemaMap> | null): MdmSchemaMap {
  if (!patch) return base;

  const merged: MdmSchemaMap = {
    overviewContainerPaths: patch.overviewContainerPaths ?? base.overviewContainerPaths,
    fields: {
      ...base.fields,
      ...(patch.fields ?? {}),
    },
    policyItem: {
      ...base.policyItem,
      ...(patch.policyItem ?? {}),
    },
    actionResult: {
      ...base.actionResult,
      ...(patch.actionResult ?? {}),
    },
  };

  return merged;
}

function getSchemaProfilePatch(): Partial<MdmSchemaMap> | null {
  const profile = String(process.env.NEXT_PUBLIC_MDM_SCHEMA_PROFILE ?? '').trim().toLowerCase();
  if (profile === 'intune') return PROFILE_INTUNE;
  if (profile === 'jamf') return PROFILE_JAMF;
  return null;
}

function getSchemaConfig() {
  const overrideRaw = String(process.env.NEXT_PUBLIC_MDM_SCHEMA_MAP_JSON ?? '').trim();
  const override = overrideRaw ? parseSchemaOverride(overrideRaw) : null;
  const strictLocked = String(process.env.NEXT_PUBLIC_MDM_SCHEMA_LOCKED ?? '').trim().toLowerCase() === 'true';

  const profilePatch = getSchemaProfilePatch();
  const withProfile = mergeSchema(DEFAULT_SCHEMA, profilePatch);
  const schema = mergeSchema(withProfile, override);

  return { schema, strictLocked };
}

function toEnrollmentState(value: unknown): MdmEnrollmentState {
  const text = String(value ?? '').toLowerCase().trim();
  if (['enrolled', 'active', 'managed', 'true'].includes(text)) return 'enrolled';
  if (['pending', 'invited', 'provisioning', 'enrolling'].includes(text)) return 'pending';
  if (['not_enrolled', 'not-enrolled', 'unenrolled', 'inactive', 'none', 'false'].includes(text)) return 'not_enrolled';
  return 'unknown';
}

function toComplianceState(value: unknown): MdmComplianceState {
  const text = String(value ?? '').toLowerCase().trim();
  if (['compliant', 'pass', 'healthy'].includes(text)) return 'compliant';
  if (['at_risk', 'at-risk', 'warning', 'warn', 'medium'].includes(text)) return 'at_risk';
  if (['non_compliant', 'non-compliant', 'fail', 'failed', 'critical', 'high_risk'].includes(text)) return 'non_compliant';
  return 'unknown';
}

function toPolicyStatus(value: unknown): MdmPolicyItem['status'] {
  const text = String(value ?? '').toLowerCase().trim();
  if (['pass', 'ok', 'success', 'compliant'].includes(text)) return 'pass';
  if (['warn', 'warning', 'at_risk', 'at-risk', 'review'].includes(text)) return 'warn';
  if (['fail', 'failed', 'non_compliant', 'non-compliant', 'block'].includes(text)) return 'fail';
  return 'unknown';
}

function normalizePolicies(value: unknown, schema: MdmSchemaMap): MdmPolicyItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = asRecord(item);
      return {
        id: asString(pickFirst(row, schema.policyItem.id), `policy-${index + 1}`),
        name: asString(pickFirst(row, schema.policyItem.name), `Policy ${index + 1}`),
        status: toPolicyStatus(pickFirst(row, schema.policyItem.status)),
        note: asString(pickFirst(row, schema.policyItem.note), ''),
      };
    })
    .slice(0, 30);
}

function pickOverviewContainer(payload: unknown, schema: MdmSchemaMap): Record<string, unknown> {
  for (const path of schema.overviewContainerPaths) {
    const candidate = asRecord(readPath(payload, path));
    if (Object.keys(candidate).length > 0) return candidate;
  }
  return asRecord(payload);
}

function normalizeOverview(payload: unknown): MdmOverview {
  const root = asRecord(payload);
  const { schema, strictLocked } = getSchemaConfig();
  const overview = pickOverviewContainer(payload, schema);

  const policies = normalizePolicies(pickFirst(overview, schema.fields.policies, pickFirst(root, schema.fields.policies)), schema);

  const provider = asString(pickFirst(overview, schema.fields.provider, pickFirst(root, schema.fields.provider)), strictLocked ? '' : 'MDM') || 'MDM';
  const deviceName = asString(pickFirst(overview, schema.fields.deviceName, pickFirst(root, schema.fields.deviceName)), strictLocked ? '' : 'Current device') || 'Current device';

  const riskScoreValue = pickFirst(overview, schema.fields.riskScore, pickFirst(root, schema.fields.riskScore, 0));

  return {
    provider,
    deviceName,
    deviceId: asString(pickFirst(overview, schema.fields.deviceId, pickFirst(root, schema.fields.deviceId))),
    platform: asString(pickFirst(overview, schema.fields.platform, pickFirst(root, schema.fields.platform))),
    enrollmentState: toEnrollmentState(pickFirst(overview, schema.fields.enrollmentState, pickFirst(root, schema.fields.enrollmentState))),
    complianceState: toComplianceState(pickFirst(overview, schema.fields.complianceState, pickFirst(root, schema.fields.complianceState))),
    lastSeenAt: asString(pickFirst(overview, schema.fields.lastSeenAt, pickFirst(root, schema.fields.lastSeenAt))) || null,
    lastPolicySyncAt: asString(pickFirst(overview, schema.fields.lastPolicySyncAt, pickFirst(root, schema.fields.lastPolicySyncAt))) || null,
    riskScore: Math.max(0, Math.min(100, asNumber(riskScoreValue, 0))),
    riskSummary: asString(pickFirst(overview, schema.fields.riskSummary, pickFirst(root, schema.fields.riskSummary)), strictLocked ? '' : 'No risk summary') || 'No risk summary',
    enrollmentUrl: asString(pickFirst(overview, schema.fields.enrollmentUrl, pickFirst(root, schema.fields.enrollmentUrl))),
    portalUrl: asString(pickFirst(overview, schema.fields.portalUrl, pickFirst(root, schema.fields.portalUrl))),
    policies,
    raw: payload,
  };
}

const DEFAULT_OVERVIEW_ENDPOINT = '/api/mdm/overview';
const DEFAULT_ACTION_ENDPOINT = '/api/mdm/action';

function getOverviewEndpoint() {
  const endpoint = String(process.env.NEXT_PUBLIC_MDM_OVERVIEW_ENDPOINT ?? '').trim();
  return endpoint || DEFAULT_OVERVIEW_ENDPOINT;
}

function getActionEndpoint() {
  const endpoint = String(process.env.NEXT_PUBLIC_MDM_ACTION_ENDPOINT ?? '').trim();
  return endpoint || DEFAULT_ACTION_ENDPOINT;
}

const MDM_FETCH_MAX_ATTEMPTS = 3;
const MDM_FETCH_BASE_DELAY_MS = 900;

function asErrorMessage(payload: unknown, fallback: string) {
  const text = String((payload as Record<string, unknown>)?.error ?? '').trim();
  return text || fallback;
}

function isRecoverableMdmFailure(status: number, payload: unknown) {
  if ([401, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = asErrorMessage(payload, '').toLowerCase();
  return message.includes('session synchronization') || message.includes('session sync');
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchMdmJsonWithRetry(
  input: string,
  init: RequestInit,
  fallbackError: string,
): Promise<unknown> {
  let lastError = fallbackError;

  for (let attempt = 1; attempt <= MDM_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(input, { cache: 'no-store', ...init });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;

      lastError = asErrorMessage(payload, fallbackError);
      if (!isRecoverableMdmFailure(response.status, payload) || attempt >= MDM_FETCH_MAX_ATTEMPTS) {
        throw new Error(lastError);
      }
    } catch (error) {
      if (error instanceof Error && attempt >= MDM_FETCH_MAX_ATTEMPTS) {
        throw new Error(error.message || fallbackError);
      }
      if (!(error instanceof Error) && attempt >= MDM_FETCH_MAX_ATTEMPTS) {
        throw new Error(lastError);
      }
    }

    await wait(Math.min(4000, MDM_FETCH_BASE_DELAY_MS * attempt));
  }

  throw new Error(lastError);
}

export async function readMdmOverview(): Promise<MdmOverview> {
  const payload = await fetchMdmJsonWithRetry(
    getOverviewEndpoint(),
    { method: 'GET' },
    'Failed to load MDM overview',
  );
  return normalizeOverview(payload);
}

export async function executeMdmAction(action: MdmActionName): Promise<MdmActionResult> {
  const payload = (await fetchMdmJsonWithRetry(
    getActionEndpoint(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    },
    'MDM action failed',
  )) as Record<string, unknown>;

  const { schema } = getSchemaConfig();
  const message = asString(pickFirst(payload, schema.actionResult.message), 'Action completed');
  const enrollmentUrl = asString(pickFirst(payload, schema.actionResult.enrollmentUrl));

  return {
    message,
    enrollmentUrl,
    raw: payload,
  };
}
