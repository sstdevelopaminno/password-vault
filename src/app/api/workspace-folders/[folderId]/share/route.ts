import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveFolderAccess, resolveWorkspaceActor } from '@/lib/workspace-cloud';
import { assertMemberQuota } from '@/lib/package-entitlements';

function normalizeEmail(raw: unknown) {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

function normalizeRole(raw: unknown): 'editor' | 'viewer' {
  return String(raw ?? '').toLowerCase() === 'viewer' ? 'viewer' : 'editor';
}

export async function POST(req: Request, context: { params: Promise<{ folderId: string }> }) {
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
    return NextResponse.json({ error: 'Only folder owner can share' }, { status: 403 });
  }

  const payload = await req.json().catch(() => ({}));
  const email = normalizeEmail((payload as { email?: unknown }).email);
  const role = normalizeRole((payload as { role?: unknown }).role);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const profileQuery = await admin.from('profiles').select('id,email').eq('email', email).maybeSingle();
  if (profileQuery.error) {
    return NextResponse.json({ error: profileQuery.error.message }, { status: 400 });
  }
  if (!profileQuery.data?.id) {
    return NextResponse.json({ error: 'User email not found in this app' }, { status: 404 });
  }

  const targetUserId = String(profileQuery.data.id ?? '').trim();
  if (!targetUserId) {
    return NextResponse.json({ error: 'Invalid target user' }, { status: 400 });
  }
  if (actor.accessibleUserIds.includes(targetUserId)) {
    return NextResponse.json({ error: 'You already have access to this folder' }, { status: 400 });
  }

  const membersCountQuery = await admin
    .from('workspace_folder_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('folder_id', folderId);
  if (membersCountQuery.error) {
    return NextResponse.json({ error: membersCountQuery.error.message }, { status: 400 });
  }

  try {
    await assertMemberQuota({
      admin,
      userId: access.ownerUserId,
      currentMemberCount: Number(membersCountQuery.count ?? 0) + 1,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 409 });
  }

  const upsertQuery = await admin
    .from('workspace_folder_members')
    .upsert(
      {
        folder_id: folderId,
        user_id: targetUserId,
        member_role: role,
      },
      { onConflict: 'folder_id,user_id' },
    )
    .select('folder_id,user_id,member_role')
    .single();

  if (upsertQuery.error || !upsertQuery.data) {
    return NextResponse.json({ error: upsertQuery.error?.message ?? 'Share folder failed' }, { status: 400 });
  }

  return NextResponse.json({
    shared: {
      folderId: String(upsertQuery.data.folder_id ?? folderId),
      userId: String(upsertQuery.data.user_id ?? ''),
      email: String(profileQuery.data.email ?? email),
      role: String(upsertQuery.data.member_role ?? role),
    },
  });
}
