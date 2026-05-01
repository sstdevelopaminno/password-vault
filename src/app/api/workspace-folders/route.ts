import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveWorkspaceActor } from '@/lib/workspace-cloud';

type FolderRow = {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  folder_id: string;
  user_id: string;
  member_role: 'viewer' | 'editor';
};

function normalizeFolderName(raw: unknown) {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export async function GET() {
  const actor = await resolveWorkspaceActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const ownedQuery = await admin
    .from('workspace_folders')
    .select('id,name,owner_user_id,created_at,updated_at')
    .in('owner_user_id', actor.accessibleUserIds)
    .order('updated_at', { ascending: false });

  if (ownedQuery.error) {
    return NextResponse.json({ error: ownedQuery.error.message }, { status: 400 });
  }

  const membershipQuery = await admin
    .from('workspace_folder_members')
    .select('folder_id,user_id,member_role')
    .in('user_id', actor.accessibleUserIds);

  if (membershipQuery.error) {
    return NextResponse.json({ error: membershipQuery.error.message }, { status: 400 });
  }

  const membershipRows = (membershipQuery.data ?? []) as MemberRow[];
  const memberFolderIds = Array.from(new Set(membershipRows.map((item) => String(item.folder_id ?? '')).filter(Boolean)));

  let sharedFolders: FolderRow[] = [];
  if (memberFolderIds.length > 0) {
    const sharedQuery = await admin
      .from('workspace_folders')
      .select('id,name,owner_user_id,created_at,updated_at')
      .in('id', memberFolderIds)
      .order('updated_at', { ascending: false });
    if (sharedQuery.error) {
      return NextResponse.json({ error: sharedQuery.error.message }, { status: 400 });
    }
    sharedFolders = (sharedQuery.data ?? []) as FolderRow[];
  }

  const ownedFolders = (ownedQuery.data ?? []) as FolderRow[];
  const combinedMap = new Map<string, FolderRow>();
  for (const folder of [...ownedFolders, ...sharedFolders]) {
    combinedMap.set(String(folder.id), folder);
  }

  const memberRoleByFolderId = new Map<string, 'viewer' | 'editor'>();
  for (const member of membershipRows) {
    const folderId = String(member.folder_id ?? '');
    if (!folderId) continue;
    const role = member.member_role === 'viewer' ? 'viewer' : 'editor';
    if (role === 'editor' || !memberRoleByFolderId.has(folderId)) {
      memberRoleByFolderId.set(folderId, role);
    }
  }

  const ownedFolderIds = ownedFolders.map((row) => String(row.id));
  let ownedFolderMembers: MemberRow[] = [];
  if (ownedFolderIds.length > 0) {
    const membersQuery = await admin
      .from('workspace_folder_members')
      .select('folder_id,user_id,member_role')
      .in('folder_id', ownedFolderIds);
    if (!membersQuery.error) {
      ownedFolderMembers = (membersQuery.data ?? []) as MemberRow[];
    }
  }

  const memberUserIds = Array.from(new Set(ownedFolderMembers.map((item) => String(item.user_id ?? '')).filter(Boolean)));
  const memberEmailById = new Map<string, string>();
  if (memberUserIds.length > 0) {
    const profilesQuery = await admin.from('profiles').select('id,email').in('id', memberUserIds);
    if (!profilesQuery.error) {
      for (const row of profilesQuery.data ?? []) {
        memberEmailById.set(String(row.id ?? ''), String(row.email ?? ''));
      }
    }
  }

  const sharedMembersByFolderId = new Map<string, Array<{ userId: string; email: string; role: 'viewer' | 'editor' }>>();
  for (const member of ownedFolderMembers) {
    const folderId = String(member.folder_id ?? '');
    const userId = String(member.user_id ?? '');
    if (!folderId || !userId) continue;
    if (actor.accessibleUserIds.includes(userId)) continue;
    const current = sharedMembersByFolderId.get(folderId) ?? [];
    current.push({
      userId,
      email: memberEmailById.get(userId) ?? '',
      role: member.member_role === 'viewer' ? 'viewer' : 'editor',
    });
    sharedMembersByFolderId.set(folderId, current);
  }

  const responseFolders = Array.from(combinedMap.values())
    .map((folder) => {
      const folderId = String(folder.id);
      const ownerUserId = String(folder.owner_user_id ?? '');
      const isOwner = actor.accessibleUserIds.includes(ownerUserId);
      const role = isOwner ? 'owner' : (memberRoleByFolderId.get(folderId) ?? 'viewer');
      return {
        id: folderId,
        name: String(folder.name ?? ''),
        ownerUserId,
        memberRole: role,
        isOwner,
        createdAt: String(folder.created_at ?? ''),
        updatedAt: String(folder.updated_at ?? ''),
        sharedMembers: isOwner ? sharedMembersByFolderId.get(folderId) ?? [] : [],
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return NextResponse.json({ folders: responseFolders });
}

export async function POST(req: Request) {
  const actor = await resolveWorkspaceActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const name = normalizeFolderName((payload as { name?: unknown }).name);
  if (!name) {
    return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const insertQuery = await admin
    .from('workspace_folders')
    .insert({
      owner_user_id: actor.actorUserId,
      name,
      created_at: now,
      updated_at: now,
    })
    .select('id,name,owner_user_id,created_at,updated_at')
    .single();

  if (insertQuery.error || !insertQuery.data) {
    return NextResponse.json({ error: insertQuery.error?.message ?? 'Create folder failed' }, { status: 400 });
  }

  return NextResponse.json({
    folder: {
      id: String(insertQuery.data.id),
      name: String(insertQuery.data.name ?? ''),
      ownerUserId: String(insertQuery.data.owner_user_id ?? ''),
      memberRole: 'owner',
      isOwner: true,
      createdAt: String(insertQuery.data.created_at ?? now),
      updatedAt: String(insertQuery.data.updated_at ?? now),
      sharedMembers: [],
    },
  });
}

