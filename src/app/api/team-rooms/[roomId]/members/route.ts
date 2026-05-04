import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { getTeamMemberContext, touchTeamRoomUpdatedAt } from '@/lib/team-room-access';
import { teamRoomShareMemberSchema } from '@/lib/validators';
import { pickPrimaryUserId, resolveAccessibleUserIds } from '@/lib/user-identity';
import { assertMemberQuota } from '@/lib/package-entitlements';

type MemberRow = {
 user_id: string;
 member_role: 'owner' | 'member';
 joined_at: string;
};

type ProfileRow = {
 id: string;
 email: string | null;
 full_name: string | null;
 status: 'pending_approval' | 'active' | 'disabled' | null;
};

type ShareSuggestion = {
 userId: string;
 fullName: string;
 email: string;
};

function forbidden(message: string) {
 return NextResponse.json({ error: message }, { status: 403 });
}

export async function GET(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
 const { roomId } = await params;
 const requestUrl = new URL(req.url);
 const searchQuery = String(requestUrl.searchParams.get('query') ?? '').trim().toLowerCase();

 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const admin = createAdminClient();
 const memberUserIds = await resolveAccessibleUserIds({
 admin,
 authUserId: auth.user.id,
 authEmail: auth.user.email,
 });
 const member = await getTeamMemberContext({ admin, roomId, userId: auth.user.id, userIds: memberUserIds });
 if (!member) {
 return NextResponse.json({ error: 'Room not found' }, { status: 404 });
 }

 const { data: members, error } = await admin
 .from('team_room_members')
 .select('user_id,member_role,joined_at')
 .eq('room_id', roomId)
 .order('joined_at', { ascending: true });
 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const memberRows = (members as MemberRow[] | null ?? []);
 const roomMemberUserIds = memberRows.map((row) => row.user_id);
 const profilesById = new Map<string, { email: string; fullName: string }>();
 if (roomMemberUserIds.length > 0) {
 const { data: profiles } = await admin.from('profiles').select('id,email,full_name').in('id', roomMemberUserIds);
 for (const row of (profiles as ProfileRow[] | null ?? [])) {
 profilesById.set(String(row.id), {
 email: String(row.email ?? ''),
 fullName: String(row.full_name ?? ''),
 });
 }
 }

 const excludedUserIds = new Set<string>(roomMemberUserIds);
 for (const userId of memberUserIds) {
 excludedUserIds.add(userId);
 }
 let suggestions: ShareSuggestion[] = [];

 if (searchQuery.length >= 2) {
 const { data: candidates, error: candidatesError } = await admin
 .from('profiles')
 .select('id,email,full_name,status')
 .eq('status', 'active')
 .ilike('email', '%' + searchQuery + '%')
 .limit(8);

 if (candidatesError) {
 return NextResponse.json({ error: candidatesError.message }, { status: 400 });
 }

 suggestions = (candidates as ProfileRow[] | null ?? [])
 .filter((candidate) => !!candidate.id && !!candidate.email && !excludedUserIds.has(String(candidate.id)))
 .map((candidate) => ({
 userId: String(candidate.id),
 fullName: String(candidate.full_name ?? ''),
 email: String(candidate.email ?? ''),
 }));
 }

 return NextResponse.json({
 members: memberRows.map((row) => ({
 userId: row.user_id,
 memberRole: row.member_role,
 joinedAt: row.joined_at,
 email: profilesById.get(row.user_id)?.email ?? '',
 fullName: profilesById.get(row.user_id)?.fullName ?? '',
 })),
 suggestions,
 });
}

export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
 const { roomId } = await params;

 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (!auth.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const payload = await req.json().catch(() => ({}));
 const parsed = teamRoomShareMemberSchema.safeParse(payload);
 if (!parsed.success) {
 return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
 }

 const admin = createAdminClient();
 const memberUserIds = await resolveAccessibleUserIds({
 admin,
 authUserId: auth.user.id,
 authEmail: auth.user.email,
 });
 const me = await getTeamMemberContext({ admin, roomId, userId: auth.user.id, userIds: memberUserIds });
 if (!me) {
 return NextResponse.json({ error: 'Room not found' }, { status: 404 });
 }
 if (me.role !== 'owner') {
 return forbidden('Only room owner can share this room');
 }

 const targetEmail = parsed.data.email;
 const { data: profile, error: profileError } = await admin
 .from('profiles')
 .select('id,email,full_name,status')
 .eq('email', targetEmail)
 .maybeSingle();

 if (profileError) {
 return NextResponse.json({ error: profileError.message }, { status: 400 });
 }
 if (!profile?.id) {
 return NextResponse.json({ error: 'No Vault user found for this email' }, { status: 404 });
 }
 if (String(profile.status ?? '') !== 'active') {
 return NextResponse.json({ error: 'Target user is not active' }, { status: 400 });
 }
 if (memberUserIds.includes(String(profile.id))) {
 return NextResponse.json({ error: 'You are already in this room' }, { status: 400 });
 }

 const { data: existingMember, error: existingError } = await admin
 .from('team_room_members')
 .select('user_id')
 .eq('room_id', roomId)
 .eq('user_id', String(profile.id))
 .maybeSingle();
 if (existingError) {
 return NextResponse.json({ error: existingError.message }, { status: 400 });
 }
 if (existingMember?.user_id) {
 return NextResponse.json({ error: 'This user is already in the room' }, { status: 400 });
 }

 const memberCountQuery = await admin
 .from('team_room_members')
 .select('user_id', { count: 'exact', head: true })
 .eq('room_id', roomId);
 if (memberCountQuery.error) {
 return NextResponse.json({ error: memberCountQuery.error.message }, { status: 400 });
 }

 const ownerUserId = pickPrimaryUserId({
 authUserId: auth.user.id,
 accessibleUserIds: memberUserIds,
 });
 if (!ownerUserId) {
 return NextResponse.json({ error: 'Unable to resolve user' }, { status: 400 });
 }

 try {
 await assertMemberQuota({
 admin,
 userId: ownerUserId,
 currentMemberCount: Number(memberCountQuery.count ?? 0),
 });
 } catch (error) {
 return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 409 });
 }

 const { error: insertError } = await admin.from('team_room_members').insert({
 room_id: roomId,
 user_id: String(profile.id),
 member_role: 'member',
 });
 if (insertError) {
 return NextResponse.json({ error: insertError.message }, { status: 400 });
 }

 await touchTeamRoomUpdatedAt({ admin, roomId });
 await logAudit('team_room_member_added', {
 room_id: roomId,
 target_user_id: String(profile.id),
 target_email: String(profile.email ?? ''),
 });

 return NextResponse.json({
 member: {
 userId: String(profile.id),
 email: String(profile.email ?? ''),
 fullName: String(profile.full_name ?? ''),
 memberRole: 'member',
 },
 });
}
