import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requirePinAssertion } from '@/lib/pin-guard';
import {
  WORKSPACE_FILES_BUCKET,
  MAX_UPLOAD_BYTES,
  SIGNED_URL_TTL_SECONDS,
  buildFolderStoragePath,
  buildFolderStoragePrefix,
  ensureWorkspaceBucket,
  normalizeFileName,
  resolveFolderAccess,
  resolveWorkspaceActor,
  sanitizeStoragePath,
} from '@/lib/workspace-cloud';
import { assertWorkspaceUploadQuota, collectPackageUsageSnapshot } from '@/lib/package-entitlements';

type WorkspaceFileResponse = {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  updatedAt: string;
  downloadUrl: string;
  previewUrl: string;
};

type SignedPair = { previewUrl: string; downloadUrl: string; path: string } | null;

function normalizeFolderId(raw: unknown) {
  return String(raw ?? '').trim();
}

async function requireFolderAccess(folderId: string) {
  const actor = await resolveWorkspaceActor();
  if (!actor) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  }

  const access = await resolveFolderAccess({
    folderId: folderId,
    accessibleUserIds: actor.accessibleUserIds,
  });
  if (!access) {
    return { error: NextResponse.json({ error: 'Folder not found' }, { status: 404 }) } as const;
  }
  return { access } as const;
}

async function signPath(path: string): Promise<SignedPair> {
  const admin = createAdminClient();
  const signedPreview = await admin.storage.from(WORKSPACE_FILES_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  const signedDownload = await admin.storage.from(WORKSPACE_FILES_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
    download: true,
  });
  if (signedPreview.error || signedDownload.error || !signedPreview.data?.signedUrl || !signedDownload.data?.signedUrl) {
    return null;
  }
  return {
    previewUrl: signedPreview.data.signedUrl,
    downloadUrl: signedDownload.data.signedUrl,
    path,
  };
}

async function tryRepairAndSign(input: {
  folderId: string;
  currentPath: string;
  currentName: string;
}): Promise<SignedPair> {
  const admin = createAdminClient();
  const safeName = normalizeFileName(input.currentName);
  if (!safeName) return null;

  const repairedPath = buildFolderStoragePath(input.folderId, safeName);
  const copied = await admin.storage.from(WORKSPACE_FILES_BUCKET).copy(input.currentPath, repairedPath);
  if (copied.error) return null;

  const removed = await admin.storage.from(WORKSPACE_FILES_BUCKET).remove([input.currentPath]);
  if (removed.error) {
    // keep copied file even if old key cleanup fails
  }

  return signPath(repairedPath);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const folderId = normalizeFolderId(searchParams.get('folderId'));
  if (!folderId) {
    return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
  }

  const secured = await requireFolderAccess(folderId);
  if ('error' in secured) return secured.error;

  try {
    await ensureWorkspaceBucket();
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 500 });
  }

  const admin = createAdminClient();
  const prefix = buildFolderStoragePrefix(folderId);
  const listed = await admin.storage.from(WORKSPACE_FILES_BUCKET).list(prefix, {
    limit: 500,
    offset: 0,
    sortBy: { column: 'updated_at', order: 'desc' },
  });
  if (listed.error) {
    return NextResponse.json({ error: listed.error.message }, { status: 400 });
  }

  const files = (listed.data ?? []).filter((item) => item.id && item.name && item.metadata);
  const responseFiles: WorkspaceFileResponse[] = [];

  for (const item of files) {
    const path = prefix + '/' + item.name;
    let signed = await signPath(path);
    if (!signed) {
      signed = await tryRepairAndSign({
        folderId,
        currentPath: path,
        currentName: String(item.name),
      });
    }
    if (!signed) {
      continue;
    }

    responseFiles.push({
      id: String(item.id),
      name: String(signed.path.split('/').pop() ?? item.name),
      path: signed.path,
      size: Number(item.metadata?.size ?? 0),
      mimeType: String(item.metadata?.mimetype ?? 'application/octet-stream'),
      updatedAt: String(item.updated_at ?? item.created_at ?? new Date().toISOString()),
      previewUrl: signed.previewUrl,
      downloadUrl: signed.downloadUrl,
    });
  }

  return NextResponse.json({ files: responseFiles });
}

export async function POST(req: Request) {
  const body = await req.formData().catch(() => null);
  const folderId = normalizeFolderId(body?.get('folderId'));
  if (!folderId) {
    return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
  }

  const secured = await requireFolderAccess(folderId);
  if ('error' in secured) return secured.error;
  if (!secured.access.canWrite) {
    return NextResponse.json({ error: 'No write permission for this folder' }, { status: 403 });
  }

  const filePart = body?.get('file');
  if (!(filePart instanceof File)) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 });
  }
  if (filePart.size <= 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  }
  if (filePart.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File is too large for this system' }, { status: 400 });
  }

  const safeName = normalizeFileName(filePart.name || 'workspace-file');
  if (!safeName) {
    return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    await assertWorkspaceUploadQuota({
      admin,
      userId: secured.access.ownerUserId,
      uploadBytes: filePart.size,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 409 });
  }

  try {
    await ensureWorkspaceBucket();
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 500 });
  }

  const path = buildFolderStoragePath(folderId, safeName);
  const bytes = new Uint8Array(await filePart.arrayBuffer());

  const uploaded = await admin.storage.from(WORKSPACE_FILES_BUCKET).upload(path, bytes, {
    cacheControl: '3600',
    upsert: false,
    contentType: filePart.type || 'application/octet-stream',
  });
  if (uploaded.error) {
    return NextResponse.json({ error: uploaded.error.message }, { status: 400 });
  }

  const signedPreview = await admin.storage.from(WORKSPACE_FILES_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  const signedDownload = await admin.storage.from(WORKSPACE_FILES_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: true });
  if (signedPreview.error || signedDownload.error || !signedPreview.data?.signedUrl || !signedDownload.data?.signedUrl) {
    return NextResponse.json(
      { error: signedPreview.error?.message ?? signedDownload.error?.message ?? 'Unable to generate download link' },
      { status: 400 },
    );
  }

  try {
    await collectPackageUsageSnapshot({
      admin,
      userId: secured.access.ownerUserId,
      includeWorkspaceBytes: true,
    });
  } catch (usageError) {
    console.error('Workspace usage sync failed after upload:', usageError);
  }

  return NextResponse.json({
    file: {
      id: path,
      name: safeName,
      path,
      size: filePart.size,
      mimeType: filePart.type || 'application/octet-stream',
      updatedAt: new Date().toISOString(),
      previewUrl: signedPreview.data.signedUrl,
      downloadUrl: signedDownload.data.signedUrl,
    } satisfies WorkspaceFileResponse,
  });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const folderId = normalizeFolderId(searchParams.get('folderId'));
  if (!folderId) {
    return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
  }

  const secured = await requireFolderAccess(folderId);
  if ('error' in secured) return secured.error;
  if (!secured.access.canWrite) {
    return NextResponse.json({ error: 'No write permission for this folder' }, { status: 403 });
  }

  const sanitized = sanitizeStoragePath(searchParams.get('path'));
  if (!sanitized) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const expectedPrefix = buildFolderStoragePrefix(folderId) + '/';
  if (!sanitized.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Forbidden path' }, { status: 403 });
  }

  const pinCheck = await requirePinAssertion({
    request: req,
    userId: auth.user.id,
    action: 'delete_workspace_file',
    targetItemId: sanitized,
  });
  if (!pinCheck.ok) {
    return pinCheck.response;
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

  try {
    await collectPackageUsageSnapshot({
      admin,
      userId: secured.access.ownerUserId,
      includeWorkspaceBytes: true,
    });
  } catch (usageError) {
    console.error('Workspace usage sync failed after delete:', usageError);
  }

  return NextResponse.json({ ok: true });
}
