import type { PinAction } from '@/lib/pin';

export type PinPolicy = Record<PinAction, boolean>;

export const DEFAULT_PIN_POLICY: PinPolicy = {
  view_secret: true,
  copy_secret: true,
  edit_secret: true,
  delete_secret: true,
  open_workspace_folder: true,
  delete_account: true,
  admin_view_vault: true,
  approve_signup_request: true,
  delete_signup_request: true,
  unlock_app: true,
  delete_workspace_folder: true,
};

export const PIN_POLICY_EDITABLE_ACTIONS = [
  'view_secret',
  'copy_secret',
  'edit_secret',
  'delete_secret',
  'open_workspace_folder',
  'delete_workspace_folder',
  'delete_account',
  'admin_view_vault',
  'approve_signup_request',
  'delete_signup_request',
] as const satisfies readonly PinAction[];

export function normalizePinPolicy(raw: unknown): PinPolicy {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<PinAction, unknown>>;
  const next = { ...DEFAULT_PIN_POLICY };

  for (const key of Object.keys(DEFAULT_PIN_POLICY) as PinAction[]) {
    if (typeof source[key] === 'boolean') {
      next[key] = source[key] as boolean;
    }
  }

  return next;
}

export function mergePinPolicy(
  current: PinPolicy,
  patch: Partial<Record<PinAction, boolean>>,
  editableOnly = false,
): PinPolicy {
  const next: PinPolicy = { ...current };
  const allowSet = editableOnly ? new Set<PinAction>(PIN_POLICY_EDITABLE_ACTIONS) : null;

  for (const [key, value] of Object.entries(patch) as Array<[PinAction, boolean]>) {
    if (typeof value !== 'boolean') continue;
    if (allowSet && !allowSet.has(key)) continue;
    next[key] = value;
  }

  return next;
}

export function isPinRequiredForAction(policy: PinPolicy, action: PinAction) {
  return policy[action] !== false;
}
