'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PinModal } from '@/components/vault/pin-modal';
import { useToast } from '@/components/ui/toast';

type User = {
 id: string;
 email: string;
 full_name: string;
 role: 'pending' | 'user' | 'approver' | 'admin' | 'super_admin';
 status: 'pending_approval' | 'active' | 'disabled';
 created_at: string;
};

type VaultLite = {
 id: string;
 title: string;
 category: string | null;
 updated_at: string;
};

type ApiUsersBody = {
 error?: string;
 users?: User[];
 pagination?: { limit: number; hasMore: boolean; nextCursor: string | null };
};

type ApiVaultBody = {
 error?: string;
 items?: VaultLite[];
 pagination?: { limit: number; hasMore: boolean; nextCursor: string | null };
};

const PAGE_SIZE = 50;

export function UsersClient() {
 const { showToast } = useToast();
 const [users, setUsers] = useState<User[]>([]);
 const [usersCursor, setUsersCursor] = useState<string | null>(null);
 const [usersHasMore, setUsersHasMore] = useState(false);
 const [usersLoading, setUsersLoading] = useState(false);
 const [usersLoadingMore, setUsersLoadingMore] = useState(false);
 const [selectedUser, setSelectedUser] = useState<string | null>(null);
 const [userVault, setUserVault] = useState<VaultLite[]>([]);
 const [vaultCursor, setVaultCursor] = useState<string | null>(null);
 const [vaultHasMore, setVaultHasMore] = useState(false);
 const [vaultLoadingMore, setVaultLoadingMore] = useState(false);
 const [vaultAssertionToken, setVaultAssertionToken] = useState<string | null>(null);
 const [pendingVaultUserId, setPendingVaultUserId] = useState<string | null>(null);

 const loadUsers = useCallback(async (append: boolean) => {
 if (append) {
 if (!usersHasMore || usersLoadingMore) return;
 setUsersLoadingMore(true);
 } else {
 if (usersLoading) return;
 setUsersLoading(true);
 }

 try {
 const params = new URLSearchParams();
 params.set('limit', String(PAGE_SIZE));
 if (append && usersCursor) params.set('cursor', usersCursor);
 const res = await fetch('/api/admin/users?' + params.toString(), { cache: 'no-store' });
 const body = (await res.json().catch(() => ({}))) as ApiUsersBody;
 if (!res.ok) {
 showToast(String(body.error ?? 'Load users failed'), 'error');
 return;
 }
 const page = Array.isArray(body.users) ? body.users : [];
 setUsersCursor(body.pagination?.nextCursor ?? null);
 setUsersHasMore(Boolean(body.pagination?.hasMore));
 if (append) {
 setUsers((prev) => {
 const known = new Set(prev.map((item) => item.id));
 return prev.concat(page.filter((item) => !known.has(item.id)));
 });
 } else {
 setUsers(page);
 }
 } catch {
 showToast('Load users failed', 'error');
 } finally {
 if (append) setUsersLoadingMore(false);
 else setUsersLoading(false);
 }
 }, [showToast, usersCursor, usersHasMore, usersLoading, usersLoadingMore]);

 useEffect(() => {
 void loadUsers(false);
 }, [loadUsers]);

 async function updateUser(userId: string, data: Partial<Pick<User, 'role' | 'status'>>) {
 const res = await fetch('/api/admin/users', {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ userId, ...data }),
 });
 if (!res.ok) {
 const body = await res.json();
 showToast(body.error ?? 'Update failed', 'error');
 return;
 }
 setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...data } : u)));
 showToast('User updated', 'success');
 }

 async function deleteUser(userId: string) {
 const res = await fetch('/api/admin/users?userId=' + userId, { method: 'DELETE' });
 if (!res.ok) {
 const body = await res.json();
 showToast(body.error ?? 'Delete failed', 'error');
 return;
 }
 setUsers((prev) => prev.filter((u) => u.id !== userId));
 showToast('User deleted', 'success');
 }

 async function loadVaultPage(targetUserId: string, assertionToken: string, append: boolean) {
 if (append) {
 if (!vaultHasMore || vaultLoadingMore) return;
 setVaultLoadingMore(true);
 }
 const payload: Record<string, unknown> = { targetUserId, limit: PAGE_SIZE };
 if (append && vaultCursor) payload.cursor = vaultCursor;
 const res = await fetch('/api/admin/view-user-vault', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'x-pin-assertion': assertionToken },
 body: JSON.stringify(payload),
 });
 const body = (await res.json().catch(() => ({}))) as ApiVaultBody;
 if (!res.ok) {
 showToast(String(body.error ?? 'Failed to open user vault'), 'error');
 if (append) setVaultLoadingMore(false);
 return;
 }
 const page = Array.isArray(body.items) ? body.items : [];
 setSelectedUser(targetUserId);
 setVaultCursor(body.pagination?.nextCursor ?? null);
 setVaultHasMore(Boolean(body.pagination?.hasMore));
 setVaultAssertionToken(assertionToken);
 if (append) {
 setUserVault((prev) => {
 const known = new Set(prev.map((item) => item.id));
 return prev.concat(page.filter((item) => !known.has(item.id)));
 });
 setVaultLoadingMore(false);
 } else {
 setUserVault(page);
 showToast('User vault opened', 'success');
 }
 }

 async function openUserVault(targetUserId: string, assertionToken: string) {
 await loadVaultPage(targetUserId, assertionToken, false);
 }

 return (

<section className='space-y-3 pb-20'>
 <h1 className='text-app-h2 font-semibold'>User Management</h1>

 {users.map((user) => (
 <Card key={user.id} className='space-y-3'>
 <div>
 <p className='text-app-body font-medium'>{user.full_name}</p>
 <p className='text-app-caption text-slate-500'>{user.email}</p>
 </div>

 <div className='grid grid-cols-2 gap-2 text-app-body'>
 <select className='h-10 rounded-xl border border-slate-200 px-3' value={user.role} onChange={(e) => void updateUser(user.id, { role: e.target.value as User['role'] })}>
 <option value='pending'>pending</option>
 <option value='user'>user</option>
 <option value='approver'>approver</option>
 <option value='admin'>admin</option>
 <option value='super_admin'>super_admin</option>
 </select>
 <select className='h-10 rounded-xl border border-slate-200 px-3' value={user.status} onChange={(e) => void updateUser(user.id, { status: e.target.value as User['status'] })}>
 <option value='pending_approval'>pending_approval</option>
 <option value='active'>active</option>
 <option value='disabled'>disabled</option>
 </select>
 </div>

 <div className='grid grid-cols-2 gap-2'>
 <Button variant='secondary' onClick={() => setPendingVaultUserId(user.id)}>Open Vault (PIN)</Button>
 <Button variant='destructive' onClick={() => void deleteUser(user.id)}>Delete User</Button>
 </div>
 </Card>
 ))}

 {usersHasMore ? (
 <Button variant='secondary' className='h-11 w-full rounded-[14px]' disabled={usersLoadingMore || usersLoading} onClick={() => void loadUsers(true)}>
 {usersLoadingMore ? 'Loading...' : 'Load more users'}
 </Button>
 ) : null}

 {pendingVaultUserId ? (
 <PinModal
 action='admin_view_vault'
 actionLabel='open user vault'
 targetItemId={pendingVaultUserId}
 onVerified={(token) => {
 void openUserVault(pendingVaultUserId, token);
 setPendingVaultUserId(null);
 }}
 onClose={() => setPendingVaultUserId(null)}
 />
 ) : null}

 {selectedUser ? (
 <Card className='space-y-2'>
 <p className='text-app-body font-semibold'>Vault items for user</p>
 {userVault.map((item) => (
 <div key={item.id} className='rounded-xl border border-slate-200 p-2 text-app-body'>
 <p className='font-medium'>{item.title}</p>
 <p className='text-app-caption text-slate-500'>{item.category ?? 'General'}</p>
 </div>
 ))}
 {userVault.length === 0 ? <p className='text-app-caption text-slate-500'>No items.</p> : null}
 {vaultHasMore ? (
 <Button
 type='button'
 variant='secondary'
 className='h-10 w-full rounded-[12px]'
 disabled={vaultLoadingMore || !vaultAssertionToken}
 onClick={() => {
 if (!selectedUser || !vaultAssertionToken) return;
 void loadVaultPage(selectedUser, vaultAssertionToken, true);
 }}
 >
 {vaultLoadingMore ? 'Loading...' : 'Load more vault items'}
 </Button>
 ) : null}
 </Card>
 ) : null}

 {users.length === 0 && !usersLoading ? <Card>No users found.</Card> : null}
 <Input placeholder='All sensitive actions are logged in audit_logs' disabled />
</section>
 );
}


