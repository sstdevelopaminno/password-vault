import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pickPrimaryUserId, resolveAccessibleUserIds } from '@/lib/user-identity';

const WORKSPACE_FILES_BUCKET = 'workspace-files';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 30;

type WorkspaceFileResponse = {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  updatedAt: string;
  downloadUrl: string;
};

function isBucketNotFoundError(message: unknown) {
  const normalized = String(message ?? '').toLowerCase();
  return normalized.includes('not found') || normalized.includes('does not exist');
}

function isBucketAlreadyExistsError(message: unknown) {
  const normalized = String(message ?? '').toLowerCase();
  return normalized.includes('already exists') || normalized.includes('duplicate');
}

async function ensureWorkspaceBucket() {
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

function normalizeFileName(raw: string) {
  return raw
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function sanitizeStoragePath(raw: string | null | undefined) {
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

function buildStoragePath(ownerUserId: string, fileName: string) {
  const stamp = Date.now();
  const random = Math.floor(Math.random() * 1_000_000_000)
    .toString(36)
    .slice(0, 6);
  return ownerUserId + '/' + stamp + '-' + random + '-' + fileName;
}

async function resolveOwnerUserId() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const admin = createAdminClient();
  const ownerIds = await resolveAccessibleUserIds({
    admin: admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });
  const ownerUserId = pickPrimaryUserId({
    authUserId: auth.user.id,
    accessibleUserIds: ownerIds,
  });
  if (!ownerUserId) return null;
  return ownerUserId;
}

export async function GET() {
  const ownerUserId = await resolveOwnerUserId();
  if (!ownerUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureWorkspaceBucket();
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 500 });
  }

  const admin = createAdminClient();
  const listResult = await admin.storage.from(WORKSPACE_FILES_BUCKET).list(ownerUserId, {
    limit: 200,
    offset: 0,
    sortBy: { column: 'updated_at', order: 'desc' },
  });
  if (listResult.error) {
    return NextResponse.json({ error: listResult.error.message }, { status: 400 });
  }

  const files = (listResult.data ?? []).filter((item) => item.id && item.name && item.metadata);
  const fullPaths = files.map((item) => ownerUserId + '/' + item.name);
  const signedResult =
    fullPaths.length > 0
      ? await admin.storage.from(WORKSPACE_FILES_BUCKET).createSignedUrls(fullPaths, SIGNED_URL_TTL_SECONDS, { download: true })
      : { data: [], error: null };

  if (signedResult.error) {
    return NextResponse.json({ error: signedResult.error.message }, { status: 400 });
  }

  const signedByPath = new Map<string, string>();
  for (const entry of signedResult.data ?? []) {
    if (!entry.path || !entry.signedUrl) continue;
    signedByPath.set(entry.path, entry.signedUrl);
  }

  const responseFiles: WorkspaceFileResponse[] = files
    .map((item) => {
      const path = ownerUserId + '/' + item.name;
      const downloadUrl = signedByPath.get(path) ?? '';
      if (!downloadUrl) return null;
      return {
        id: String(item.id),
        name: String(item.name),
        path,
        size: Number(item.metadata?.size ?? 0),
        mimeType: String(item.metadata?.mimetype ?? 'application/octet-stream'),
        updatedAt: String(item.updated_at ?? item.created_at ?? new Date().toISOString()),
        downloadUrl,
      } satisfies WorkspaceFileResponse;
    })
    .filter((item): item is WorkspaceFileResponse => Boolean(item));

  return NextResponse.json({ files: responseFiles });
}

export async function POST(req: Request) {
  const ownerUserId = await resolveOwnerUserId();
  if (!ownerUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.formData().catch(() => null);
  const filePart = body?.get('file');
  if (!(filePart instanceof File)) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 });
  }
  if (filePart.size <= 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  }
  if (filePart.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 25 MB)' }, { status: 400 });
  }

  const safeName = normalizeFileName(filePart.name || 'workspace-file');
  if (!safeName) {
    return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
  }

  try {
    await ensureWorkspaceBucket();
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 500 });
  }

  const path = buildStoragePath(ownerUserId, safeName);
  const bytes = new Uint8Array(await filePart.arrayBuffer());
  const admin = createAdminClient();

  const uploaded = await admin.storage.from(WORKSPACE_FILES_BUCKET).upload(path, bytes, {
    cacheControl: '3600',
    upsert: false,
    contentType: filePart.type || 'application/octet-stream',
  });
  if (uploaded.error) {
    return NextResponse.json({ error: uploaded.error.message }, { status: 400 });
  }

  const signed = await admin.storage.from(WORKSPACE_FILES_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: true });
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: signed.error?.message ?? 'Unable to generate download link' }, { status: 400 });
  }

  return NextResponse.json({
    file: {
      id: path,
      name: safeName,
      path,
      size: filePart.size,
      mimeType: filePart.type || 'application/octet-stream',
      updatedAt: new Date().toISOString(),
      downloadUrl: signed.data.signedUrl,
    } satisfies WorkspaceFileResponse,
  });
}

export async function DELETE(req: Request) {
  const ownerUserId = await resolveOwnerUserId();
  if (!ownerUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sanitized = sanitizeStoragePath(searchParams.get('path'));
  if (!sanitized) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  if (!sanitized.startsWith(ownerUserId + '/')) {
    return NextResponse.json({ error: 'Forbidden path' }, { status: 403 });
  }

  try {
    await ensureWorkspaceBucket();
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 500 });
  }

  const admin = createAdminClient();
  const removed = await admin.storage.from(WORKSPACE_FILES_BUCKET).remove([sanitized]);
  if (removed.error) {
    return NextResponse.json({ error: removed.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
