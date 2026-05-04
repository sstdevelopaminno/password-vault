import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { pickPrimaryUserId, resolveAccessibleUserIds } from '@/lib/user-identity';

export const WORKSPACE_FILES_BUCKET = 'workspace-files';
export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 60 * 30;

export type WorkspaceActor = {
  accessibleUserIds: string[];
  actorUserId: string;
  authUserId: string;
};

export type WorkspaceFolderAccess = {
  folderId: string;
  folderName: string;
  ownerUserId: string;
  role: 'owner' | 'editor' | 'viewer';
  canWrite: boolean;
};

export function normalizeFileName(raw: string) {
  const normalized = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .trim();

  const lastDot = normalized.lastIndexOf('.');
  const baseRaw = lastDot > 0 ? normalized.slice(0, lastDot) : normalized;
  const extRaw = lastDot > 0 ? normalized.slice(lastDot + 1) : '';

  const baseSafe = baseRaw
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 96);

  const extSafe = extRaw
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 12)
    .toLowerCase();

  const fileBase = baseSafe || 'workspace-file';
  return extSafe ? `${fileBase}.${extSafe}` : fileBase;
}

export function sanitizeStoragePath(raw: string | null | undefined) {
  const normalized = String(raw ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
  if (!normalized) return '';
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return '';
  for (const segment of segments) {
    if (segment === '.' || segment === '..') return '';
  }
  return segments.join('/');
}

function isBucketNotFoundError(message: unknown) {
  const normalized = String(message ?? '').toLowerCase();
  return normalized.includes('not found') || normalized.includes('does not exist');
}

function isBucketAlreadyExistsError(message: unknown) {
  const normalized = String(message ?? '').toLowerCase();
  return normalized.includes('already exists') || normalized.includes('duplicate');
}

export async function ensureWorkspaceBucket() {
  const admin = createAdminClient();
  const bucket = await admin.storage.getBucket(WORKSPACE_FILES_BUCKET);
  if (!bucket.error) return;
  if (!isBucketNotFoundError(bucket.error.message)) {
    throw new Error(bucket.error.message);
  }

  const created = await admin.storage.createBucket(WORKSPACE_FILES_BUCKET, {
    public: false,
    fileSizeLimit: MAX_UPLOAD_BYTES,
  });
  if (created.error && !isBucketAlreadyExistsError(created.error.message)) {
    throw new Error(created.error.message);
  }
}

export async function resolveWorkspaceActor(): Promise<WorkspaceActor | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const admin = createAdminClient();
  const accessibleUserIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });
  const actorUserId = pickPrimaryUserId({
    authUserId: auth.user.id,
    accessibleUserIds: accessibleUserIds,
  });

  if (!actorUserId) return null;

  return {
    accessibleUserIds,
    actorUserId,
    authUserId: auth.user.id,
  };
}

function normalizeRole(raw: unknown): 'editor' | 'viewer' {
  return String(raw ?? '').toLowerCase() === 'viewer' ? 'viewer' : 'editor';
}

export async function resolveFolderAccess(input: {
  folderId: string;
  accessibleUserIds: string[];
}): Promise<WorkspaceFolderAccess | null> {
  const folderId = String(input.folderId ?? '').trim();
  if (!folderId) return null;

  const admin = createAdminClient();
  const folderQuery = await admin
    .from('workspace_folders')
    .select('id,name,owner_user_id')
    .eq('id', folderId)
    .maybeSingle();

  if (folderQuery.error || !folderQuery.data?.id) return null;

  const ownerUserId = String(folderQuery.data.owner_user_id ?? '').trim();
  if (ownerUserId && input.accessibleUserIds.includes(ownerUserId)) {
    return {
      folderId: String(folderQuery.data.id),
      folderName: String(folderQuery.data.name ?? ''),
      ownerUserId,
      role: 'owner',
      canWrite: true,
    };
  }

  const memberQuery = await admin
    .from('workspace_folder_members')
    .select('member_role')
    .eq('folder_id', folderId)
    .in('user_id', input.accessibleUserIds)
    .limit(1)
    .maybeSingle();

  if (memberQuery.error || !memberQuery.data) return null;

  const role = normalizeRole(memberQuery.data.member_role);
  return {
    folderId: String(folderQuery.data.id),
    folderName: String(folderQuery.data.name ?? ''),
    ownerUserId,
    role,
    canWrite: role === 'editor',
  };
}

export function buildFolderStoragePrefix(folderId: string) {
  return 'folders/' + folderId;
}

export function buildFolderStoragePath(folderId: string, fileName: string) {
  const stamp = Date.now();
  const random = Math.floor(Math.random() * 1_000_000_000)
    .toString(36)
    .slice(0, 6);
  return buildFolderStoragePrefix(folderId) + '/' + stamp + '-' + random + '-' + fileName;
}
