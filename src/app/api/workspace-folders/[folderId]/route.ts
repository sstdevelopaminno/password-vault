import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  WORKSPACE_FILES_BUCKET,
  buildFolderStoragePrefix,
  ensureWorkspaceBucket,
  resolveFolderAccess,
  resolveWorkspaceActor,
} from '@/lib/workspace-cloud';
import { requirePinAssertion } from '@/lib/pin-guard';

const LIST_LIMIT = 100;

async function removeAllFolderFiles(folderId: string) {
  const prefix = buildFolderStoragePrefix(folderId);
  const admin = createAdminClient();

  while (true) {
    const listed = await admin.storage.from(WORKSPACE_FILES_BUCKET).list(prefix, {
      limit: LIST_LIMIT,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (listed.error) {
      throw new Error(listed.error.message);
    }

    const entries = listed.data ?? [];
    if (entries.length === 0) {
      break;
    }

    const paths = entries
      .map((item) => {
        const name = String(item.name ?? '').trim();
        if (!name) return '';
        return prefix + '/' + name;
      })
      .filter(Boolean);

    if (paths.length > 0) {
      const removed = await admin.storage.from(WORKSPACE_FILES_BUCKET).remove(paths);
      if (removed.error) {
        throw new Error(removed.error.message);
      }
    }

    if (entries.length < LIST_LIMIT) {
      break;
    }
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ folderId: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const actor = await resolveWorkspaceActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = await context.params;
  const folderId = String(params.folderId ?? '').trim();
  if (!folderId) {
    return NextResponse.json({ error: 'Folder id is required' }, { status: 400 });
  }

  const access = await resolveFolderAccess({
    folderId,
    accessibleUserIds: actor.accessibleUserIds,
  });
  if (!access) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }
  if (access.role !== 'owner') {
    return NextResponse.json({ error: 'Only folder owner can delete this folder' }, { status: 403 });
  }

  const pinCheck = await requirePinAssertion({
    request: _req,
    userId: auth.user.id,
    action: 'delete_workspace_folder',
    targetItemId: folderId,
  });
  if (!pinCheck.ok) {
    return pinCheck.response;
  }

  const admin = createAdminClient();

  try {
    await ensureWorkspaceBucket();
    await removeAllFolderFiles(folderId);

    const deleteMembers = await admin.from('workspace_folder_members').delete().eq('folder_id', folderId);
    if (deleteMembers.error) {
      return NextResponse.json({ error: deleteMembers.error.message }, { status: 400 });
    }

    const deleteFolder = await admin.from('workspace_folders').delete().eq('id', folderId);
    if (deleteFolder.error) {
      return NextResponse.json({ error: deleteFolder.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : 'Failed to delete folder') },
      { status: 500 },
    );
  }
}
