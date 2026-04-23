'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Edit3, Plus, Search, Share2, Trash2, Users2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';
import { fetchWithSessionRetry } from '@/lib/api-client';

type TeamRoom = {
 id: string;
 name: string;
 description: string;
 updatedAt: string;
 memberRole: 'owner' | 'member';
};

type TeamMember = {
 userId: string;
 fullName: string;
 email: string;
 memberRole: 'owner' | 'member';
};

type ShareSuggestion = {
 userId: string;
 fullName: string;
 email: string;
};

export default function OrgSharedPage() {
 const router = useRouter();
 const { locale } = useI18n();
 const { showToast } = useToast();

 const [rooms, setRooms] = useState<TeamRoom[]>([]);
 const [search, setSearch] = useState('');
 const [loading, setLoading] = useState(false);

 const [createOpen, setCreateOpen] = useState(false);
 const [creating, setCreating] = useState(false);
 const [roomName, setRoomName] = useState('');
 const [roomDescription, setRoomDescription] = useState('');

 const [editingRoom, setEditingRoom] = useState<TeamRoom | null>(null);
 const [updatingRoom, setUpdatingRoom] = useState(false);

 const [deletingRoom, setDeletingRoom] = useState<TeamRoom | null>(null);
 const [deletingRoomBusy, setDeletingRoomBusy] = useState(false);

 const [sharingRoom, setSharingRoom] = useState<TeamRoom | null>(null);
 const [shareEmail, setShareEmail] = useState('');
 const [sharingBusy, setSharingBusy] = useState(false);
 const [loadingMembers, setLoadingMembers] = useState(false);
 const [loadingShareSuggestions, setLoadingShareSuggestions] = useState(false);
 const [members, setMembers] = useState<TeamMember[]>([]);
 const [shareSuggestions, setShareSuggestions] = useState<ShareSuggestion[]>([]);

 const loadRooms = useCallback(async () => {
 setLoading(true);
 const res = await fetchWithSessionRetry('/api/team-rooms', { cache: 'no-store' });
 const body = (await res.json().catch(() => ({}))) as {
 error?: string;
 rooms?: Array<{ id: string; name: string; description?: string; updatedAt?: string; memberRole?: 'owner' | 'member' }>;
 };
 setLoading(false);

 if (!res.ok) {
 showToast(body.error ?? 'Failed to load team rooms', 'error');
 return;
 }

 setRooms((body.rooms ?? []).map((room) => ({
 id: room.id,
 name: room.name,
 description: room.description ?? '',
 updatedAt: room.updatedAt ?? '',
 memberRole: room.memberRole ?? 'member',
 })));
 }, [showToast]);

 useEffect(() => {
 const timer = window.setTimeout(() => {
 void loadRooms();
 }, 0);
 return () => window.clearTimeout(timer);
 }, [loadRooms]);

 const filteredRooms = useMemo(() => {
 const keyword = search.trim().toLowerCase();
 if (!keyword) return rooms;
 return rooms.filter((room) => room.name.toLowerCase().includes(keyword) || room.description.toLowerCase().includes(keyword));
 }, [rooms, search]);

 function toDisplayDate(raw: string) {
 if (!raw) return locale === 'th' ? 'เน€เธกเธทเนเธญเธชเธฑเธเธเธฃเธนเน' : 'Just now';
 const parsed = new Date(raw);
 if (Number.isNaN(parsed.getTime())) return locale === 'th' ? 'เน€เธกเธทเนเธญเธชเธฑเธเธเธฃเธนเน' : 'Just now';
 return parsed.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US');
 }

 function resetCreateForm() {
 setRoomName('');
 setRoomDescription('');
 }


 async function createRoom() {
 if (creating) return;
 const name = roomName.trim();
 if (!name) {
 showToast(locale === 'th' ? 'เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธเธทเนเธญเธซเนเธญเธเธ—เธตเธก' : 'Please enter room name', 'error');
 return;
 }

 setCreating(true);
 const res = await fetch('/api/team-rooms', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ name, description: roomDescription.trim() }),
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string; room?: { id: string } };
 setCreating(false);

 if (!res.ok || !body.room) {
 showToast(body.error ?? 'Failed to create room', 'error');
 return;
 }

 showToast(locale === 'th' ? 'เธชเธฃเนเธฒเธเธซเนเธญเธเธ—เธตเธกเธชเธณเน€เธฃเนเธ' : 'Room created', 'success');
 setCreateOpen(false);
 resetCreateForm();
 await loadRooms();
 router.push('/org-shared/' + encodeURIComponent(body.room.id));
 }

 async function updateRoom() {
 if (!editingRoom || updatingRoom) return;
 const name = roomName.trim();
 if (!name) {
 showToast(locale === 'th' ? 'เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธเธทเนเธญเธซเนเธญเธเธ—เธตเธก' : 'Please enter room name', 'error');
 return;
 }

 setUpdatingRoom(true);
 const res = await fetch('/api/team-rooms/' + encodeURIComponent(editingRoom.id), {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ name, description: roomDescription.trim() }),
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setUpdatingRoom(false);

 if (!res.ok) {
 showToast(body.error ?? 'Failed to update room', 'error');
 return;
 }

 showToast(locale === 'th' ? 'เนเธเนเนเธเธเธทเนเธญเธซเนเธญเธเธชเธณเน€เธฃเนเธ' : 'Room updated', 'success');
 setEditingRoom(null);
 resetCreateForm();
 await loadRooms();
 }

 async function deleteRoom() {
 if (!deletingRoom || deletingRoomBusy) return;
 setDeletingRoomBusy(true);
 const res = await fetch('/api/team-rooms/' + encodeURIComponent(deletingRoom.id), { method: 'DELETE' });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setDeletingRoomBusy(false);

 if (!res.ok) {
 showToast(body.error ?? 'Failed to delete room', 'error');
 return;
 }

 showToast(locale === 'th' ? 'เธฅเธเธซเนเธญเธเธ—เธตเธกเนเธฅเนเธง' : 'Room deleted', 'success');
 setDeletingRoom(null);
 await loadRooms();
 }

 const loadRoomMembers = useCallback(async function (roomId: string, query = '', suppressErrorToast = false) {
 const normalizedQuery = query.trim().toLowerCase();
 setLoadingMembers(true);
 setLoadingShareSuggestions(normalizedQuery.length >= 2);

 const endpoint = '/api/team-rooms/' + encodeURIComponent(roomId) + '/members' + (normalizedQuery ? '?query=' + encodeURIComponent(normalizedQuery) : '');
 const res = await fetchWithSessionRetry(endpoint, { cache: 'no-store' });
 const body = (await res.json().catch(() => ({}))) as {
 error?: string;
 members?: Array<{ userId: string; fullName?: string; email?: string; memberRole?: 'owner' | 'member' }>;
 suggestions?: Array<{ userId: string; fullName?: string; email?: string }>;
 };
 setLoadingMembers(false);
 setLoadingShareSuggestions(false);

 if (!res.ok) {
 if (!suppressErrorToast) showToast(body.error ?? 'Failed to load members', 'error');
 setMembers([]);
 setShareSuggestions([]);
 return;
 }

 setMembers((body.members ?? []).map((item) => ({
 userId: item.userId,
 fullName: item.fullName ?? '',
 email: item.email ?? '',
 memberRole: item.memberRole ?? 'member',
 })));

 setShareSuggestions((body.suggestions ?? []).map((item) => ({
 userId: item.userId,
 fullName: item.fullName ?? '',
 email: item.email ?? '',
 })));
 }, [showToast]);

 useEffect(() => {
 if (!sharingRoom) return;
 const keyword = shareEmail.trim();
 if (keyword.length < 2) {
 const timer = window.setTimeout(() => {
 setShareSuggestions([]);
 setLoadingShareSuggestions(false);
 }, 0);
 return () => window.clearTimeout(timer);
 }

 const timer = window.setTimeout(() => {
 void loadRoomMembers(sharingRoom.id, keyword, true);
 }, 280);

 return () => window.clearTimeout(timer);
 }, [loadRoomMembers, shareEmail, sharingRoom]);

 async function shareRoomToEmail() {
 if (!sharingRoom || sharingBusy) return;
 const email = shareEmail.trim().toLowerCase();
 if (!email) {
 showToast(locale === 'th' ? 'เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธญเธตเน€เธกเธฅเธเธนเนเนเธเนเธเธฒเธ' : 'Please enter user email', 'error');
 return;
 }

 setSharingBusy(true);
 const res = await fetch('/api/team-rooms/' + encodeURIComponent(sharingRoom.id) + '/members', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ email }),
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setSharingBusy(false);

 if (!res.ok) {
 showToast(body.error ?? 'Failed to share room', 'error');
 return;
 }

 setShareEmail('');
 setShareSuggestions([]);
 showToast(locale === 'th' ? 'เนเธเธฃเนเธซเนเธญเธเธชเธณเน€เธฃเนเธ' : 'Room shared', 'success');
 await loadRoomMembers(sharingRoom.id, '');
 await loadRooms();
 }


 return (
 <section className='space-y-4 pb-24 pt-2'>
 <header className='space-y-1'>
 <h1 className='text-app-h1 font-semibold leading-tight text-[#f2f8ff]'>{locale === 'th' ? 'เธฃเธซเธฑเธชเธ—เธตเธก' : 'Team Keys'}</h1>
 <p className='text-app-body leading-6 text-[#9eb2d9]'>
 {locale === 'th'
 ? 'เธซเนเธญเธเธ—เธตเธกเธเธฐเนเธชเธ”เธเนเธเธ 2 เธเนเธญเธเธ•เนเธญเนเธ–เธง เธเธฑเธ”เธเธฒเธฃเธซเนเธญเธเนเธ”เนเธ—เธฑเธเธ—เธต (เนเธเนเธเธทเนเธญ/เธฅเธ/เนเธเธฃเนเธซเนเธญเธ)'
 : 'Rooms are shown in a 2-column grid. You can edit, delete, and share rooms directly.'}
 </p>
 </header>

 <div className='relative'>
 <Search className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
 <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={locale === 'th' ? 'เธเนเธเธซเธฒเธซเนเธญเธเธ—เธตเธก' : 'Search rooms'} className='h-11 rounded-[14px] pl-11 text-app-body' />
 </div>

 <Button type='button' className='h-11 w-full rounded-xl' onClick={() => setCreateOpen(true)}>
 <span className='inline-flex items-center gap-2'>
 <Plus className='h-4 w-4' />
 {locale === 'th' ? 'เธชเธฃเนเธฒเธเธซเนเธญเธเธ—เธตเธกเนเธซเธกเน' : 'Create Team Room'}
 </span>
 </Button>

 {loading ? <p className='text-center text-app-body text-slate-500'>{locale === 'th' ? 'เธเธณเธฅเธฑเธเนเธซเธฅเธ”...' : 'Loading...'}</p> : null}

 {!loading && filteredRooms.length === 0 ? (
 <Card className='space-y-2 rounded-[20px] text-center'>
 <Users2 className='mx-auto h-8 w-8 text-slate-400' />
 <p className='text-app-body font-semibold text-slate-700'>{locale === 'th' ? 'เธขเธฑเธเนเธกเนเธกเธตเธซเนเธญเธเธ—เธตเธก' : 'No team rooms yet'}</p>
 <p className='text-app-caption text-slate-500'>{locale === 'th' ? 'เน€เธฃเธดเนเธกเธเธฒเธเธเธฒเธฃเธชเธฃเนเธฒเธเธซเนเธญเธเนเธฃเธเธเธญเธเธเธธเธ“' : 'Create your first room to continue.'}</p>
 </Card>
 ) : null}

 <div className='grid grid-cols-2 gap-2.5'>
 {filteredRooms.map((room) => (
 <Card key={room.id} className='relative flex min-h-[170px] flex-col rounded-[16px] p-3'>
 <button type='button' className='absolute inset-0 rounded-[16px]' onClick={() => router.push('/org-shared/' + encodeURIComponent(room.id))} aria-label={locale === 'th' ? 'เน€เธเธดเธ”เธซเนเธญเธเธ—เธตเธก' : 'Open team room'} />

 <div className='relative z-[1] flex items-start justify-between gap-2'>
 <p className='line-clamp-2 text-app-body font-semibold text-slate-900'>{room.name}</p>
 <span className='rounded-full bg-blue-50 px-2 py-0.5 text-app-micro font-semibold text-blue-700'>
 {room.memberRole === 'owner' ? (locale === 'th' ? 'เน€เธเนเธฒเธเธญเธ' : 'Owner') : locale === 'th' ? 'เธชเธกเธฒเธเธดเธ' : 'Member'}
 </span>
 </div>

 <p className='relative z-[1] mt-2 line-clamp-3 text-app-caption text-slate-500'>{room.description || (locale === 'th' ? 'เนเธกเนเธกเธตเธเธณเธญเธเธดเธเธฒเธข' : 'No description')}</p>

 <div className='relative z-[1] mt-auto space-y-2'>
 <div className='text-app-micro text-slate-500'>{toDisplayDate(room.updatedAt)}</div>

 <div className='grid grid-cols-3 gap-1.5'>
 <button
 type='button'
 disabled={room.memberRole !== 'owner'}
 onClick={(e) => {
 e.stopPropagation();
 if (room.memberRole !== 'owner') return;
 setEditingRoom(room);
 setRoomName(room.name);
 setRoomDescription(room.description);
 }}
 className={'inline-flex h-8 items-center justify-center rounded-lg border text-app-caption transition ' + (room.memberRole === 'owner' ? 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700' : 'border-slate-100 bg-slate-50 text-slate-300')}
 >
 <Edit3 className='h-3.5 w-3.5' />
 </button>

 <button
 type='button'
 disabled={room.memberRole !== 'owner'}
 onClick={(e) => {
 e.stopPropagation();
 if (room.memberRole !== 'owner') return;
 setDeletingRoom(room);
 }}
 className={'inline-flex h-8 items-center justify-center rounded-lg border text-app-caption transition ' + (room.memberRole === 'owner' ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-slate-100 bg-slate-50 text-slate-300')}
 >
 <Trash2 className='h-3.5 w-3.5' />
 </button>

 <button
 type='button'
 disabled={room.memberRole !== 'owner'}
 onClick={(e) => {
 e.stopPropagation();
 if (room.memberRole !== 'owner') return;
 setSharingRoom(room);
 setShareEmail('');
 setShareSuggestions([]);
 setLoadingShareSuggestions(false);
 void loadRoomMembers(room.id, '');
 }}
 className={'inline-flex h-8 items-center justify-center rounded-lg border text-app-caption transition ' + (room.memberRole === 'owner' ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-slate-100 bg-slate-50 text-slate-300')}
 >
 <Share2 className='h-3.5 w-3.5' />
 </button>
 </div>

 <button type='button' onClick={(e) => { e.stopPropagation(); router.push('/org-shared/' + encodeURIComponent(room.id)); }} className='inline-flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-app-caption font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700'>
 {locale === 'th' ? 'เน€เธเธดเธ”เธซเนเธญเธ' : 'Open'} <ArrowRight className='h-3.5 w-3.5' />
 </button>
 </div>
 </Card>
 ))}
 </div>


 {createOpen ? (
 <div className='fixed inset-0 z-[75] bg-slate-950/45 p-3 backdrop-blur-[2px]'>
<div className='mx-auto mt-6 w-full max-w-[460px] animate-slide-up rounded-[28px] bg-white p-4 shadow-2xl sm:mt-10'>
 <div className='mb-3 flex items-center justify-between'>
 <h2 className='text-app-body font-semibold text-slate-900'>{locale === 'th' ? 'เธชเธฃเนเธฒเธเธซเนเธญเธเธ—เธตเธกเนเธซเธกเน' : 'Create Team Room'}</h2>
 <button onClick={() => { setCreateOpen(false); resetCreateForm(); }} className='rounded-full p-1 text-slate-500 hover:bg-slate-100'>
 <X className='h-5 w-5' />
 </button>
 </div>
<Card className='space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-3'>
<p className='text-app-micro font-semibold uppercase tracking-[0.08em] text-slate-500'>{locale === 'th' ? 'เธเนเธญเธกเธนเธฅเธซเนเธญเธเธ—เธตเธก' : 'Room details'}</p>
<Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder={locale === 'th' ? 'เธเธทเนเธญเธซเนเธญเธเธ—เธตเธก' : 'Room name'} maxLength={80} className='h-10 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:ring-blue-100' />
<Input value={roomDescription} onChange={(e) => setRoomDescription(e.target.value)} placeholder={locale === 'th' ? 'เธเธณเธญเธเธดเธเธฒเธข (เนเธกเนเธเธฑเธเธเธฑเธ)' : 'Description (optional)'} maxLength={500} className='h-10 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:ring-blue-100' />
<Button type='button' className='h-10 w-full' onClick={() => void createRoom()} disabled={creating}>
 {creating ? (locale === 'th' ? 'เธเธณเธฅเธฑเธเธชเธฃเนเธฒเธ...' : 'Creating...') : locale === 'th' ? 'เธชเธฃเนเธฒเธเธซเนเธญเธ' : 'Create Room'}
 </Button>
 </Card>
 </div>
 </div>
 ) : null}

 {editingRoom ? (
 <div className='fixed inset-0 z-[75] bg-slate-950/45 p-3 backdrop-blur-[2px]'>
<div className='mx-auto mt-6 w-full max-w-[460px] animate-slide-up rounded-[28px] bg-white p-4 shadow-2xl sm:mt-10'>
 <div className='mb-3 flex items-center justify-between'>
 <h2 className='text-app-body font-semibold text-slate-900'>{locale === 'th' ? 'เนเธเนเนเธเธเนเธญเธกเธนเธฅเธซเนเธญเธเธ—เธตเธก' : 'Edit Team Room'}</h2>
 <button onClick={() => { setEditingRoom(null); resetCreateForm(); }} className='rounded-full p-1 text-slate-500 hover:bg-slate-100'>
 <X className='h-5 w-5' />
 </button>
 </div>
<Card className='space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-3'>
<p className='text-app-micro font-semibold uppercase tracking-[0.08em] text-slate-500'>{locale === 'th' ? 'เธเนเธญเธกเธนเธฅเธซเนเธญเธเธ—เธตเธก' : 'Room details'}</p>
<Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder={locale === 'th' ? 'เธเธทเนเธญเธซเนเธญเธเธ—เธตเธก' : 'Room name'} maxLength={80} className='h-10 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:ring-blue-100' />
<Input value={roomDescription} onChange={(e) => setRoomDescription(e.target.value)} placeholder={locale === 'th' ? 'เธเธณเธญเธเธดเธเธฒเธข (เนเธกเนเธเธฑเธเธเธฑเธ)' : 'Description (optional)'} maxLength={500} className='h-10 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:ring-blue-100' />
<Button type='button' className='h-10 w-full' onClick={() => void updateRoom()} disabled={updatingRoom}>
 {updatingRoom ? (locale === 'th' ? 'เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธ...' : 'Saving...') : locale === 'th' ? 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเนเธเนเนเธ' : 'Save changes'}
 </Button>
 </Card>
 </div>
 </div>
 ) : null}

 {deletingRoom ? (
 <div className='fixed inset-0 z-[75] bg-slate-950/45 p-3 backdrop-blur-[2px]'>
 <div className='mx-auto mt-14 w-full max-w-[420px] animate-slide-up rounded-[26px] bg-white p-4 shadow-2xl'>
 <h2 className='text-app-body font-semibold text-slate-900'>{locale === 'th' ? 'เธขเธทเธเธขเธฑเธเธเธฒเธฃเธฅเธเธซเนเธญเธเธ—เธตเธก' : 'Confirm room deletion'}</h2>
 <p className='mt-2 text-app-body text-slate-600'>
 {locale === 'th'
 ? 'เธเธฒเธฃเธฅเธเธซเนเธญเธเธเธฐเธฅเธเธฃเธฒเธขเธเธฒเธฃเนเธฅเธฐเนเธเธ—เธ—เธฑเนเธเธซเธกเธ”เนเธเธซเนเธญเธเธเธตเนเธ–เธฒเธงเธฃ'
 : 'Deleting this room will permanently remove all room items and chat messages.'}
 </p>
 <p className='mt-2 rounded-lg bg-slate-100 px-3 py-2 text-app-body font-semibold text-slate-800'>{deletingRoom.name}</p>
 <div className='mt-4 grid grid-cols-2 gap-2'>
 <Button type='button' variant='secondary' className='w-full' onClick={() => setDeletingRoom(null)}>{locale === 'th' ? 'เธขเธเน€เธฅเธดเธ' : 'Cancel'}</Button>
 <Button type='button' className='w-full' onClick={() => void deleteRoom()} disabled={deletingRoomBusy}>
 {deletingRoomBusy ? (locale === 'th' ? 'เธเธณเธฅเธฑเธเธฅเธ...' : 'Deleting...') : locale === 'th' ? 'เธฅเธเธซเนเธญเธ' : 'Delete room'}
 </Button>
 </div>
 </div>
 </div>
 ) : null}

 {sharingRoom ? (
 <div className='fixed inset-0 z-[75] bg-slate-950/45 p-3 backdrop-blur-[2px]'>
 <div className='mx-auto mt-8 w-full max-w-[460px] animate-slide-up rounded-[28px] bg-white p-4 shadow-2xl'>
 <div className='mb-3 flex items-center justify-between'>
 <h2 className='text-app-body font-semibold text-slate-900'>{locale === 'th' ? 'เนเธเธฃเนเธซเนเธญเธเธ—เธตเธกเธ”เนเธงเธขเธญเธตเน€เธกเธฅ' : 'Share room by email'}</h2>
 <button onClick={() => { setSharingRoom(null); setShareEmail(''); setShareSuggestions([]); setLoadingShareSuggestions(false); }} className='rounded-full p-1 text-slate-500 hover:bg-slate-100'>
 <X className='h-5 w-5' />
 </button>
 </div>

<Card className='space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-3'>
 <p className='text-app-caption text-slate-500'>
 {locale === 'th'
 ? 'เนเธเธฃเนเนเธ”เนเน€เธเธเธฒเธฐเธญเธตเน€เธกเธฅเธเธนเนเนเธเนเธเธฒเธเธ—เธตเนเธกเธตเธเธฑเธเธเธตเนเธ Vault เนเธฅเธฐเธชเธ–เธฒเธเธฐ Active'
 : 'Only existing active Vault users can be invited by email.'}
 </p>
<Input value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder={locale === 'th' ? 'เธญเธตเน€เธกเธฅเธเธนเนเนเธเนเธเธฒเธเนเธเธฃเธฐเธเธ' : 'App user email'} className='h-10 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:ring-blue-100' />

 {shareEmail.trim().length >= 2 ? (
 <div className='space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-2'>
 <p className='text-app-micro font-semibold text-slate-600'>{locale === 'th' ? 'เธเธฅเธเธฒเธฃเธเนเธเธซเธฒเธเธนเนเนเธเนเธเธฒเธเนเธเธฃเธฐเธเธ' : 'Matched app users'}</p>
 <div className='max-h-28 space-y-1 overflow-y-auto'>
 {loadingShareSuggestions ? (
 <p className='text-center text-app-caption text-slate-500'>{locale === 'th' ? 'เธเธณเธฅเธฑเธเธเนเธเธซเธฒ...' : 'Searching...'}</p>
 ) : shareSuggestions.length === 0 ? (
 <p className='text-center text-app-caption text-slate-500'>{locale === 'th' ? 'เนเธกเนเธเธเธเธนเนเนเธเนเธเธฒเธเธ—เธตเนเนเธเธฃเนเนเธ”เน' : 'No shareable users found'}</p>
 ) : (
 shareSuggestions.map((suggestion) => (
 <button
 key={suggestion.userId}
 type='button'
 onClick={() => setShareEmail(suggestion.email)}
 className='flex w-full items-center justify-between rounded-lg bg-white px-2 py-1.5 text-left text-app-caption transition hover:bg-blue-50'
 >
 <span className='min-w-0 truncate font-semibold text-slate-800'>{suggestion.fullName || suggestion.email}</span>
 <span className='ml-2 truncate text-slate-500'>{suggestion.email}</span>
 </button>
 ))
 )}
 </div>
 </div>
 ) : null}

 <Button type='button' className='w-full' onClick={() => void shareRoomToEmail()} disabled={sharingBusy}>
 {sharingBusy ? (locale === 'th' ? 'เธเธณเธฅเธฑเธเนเธเธฃเน...' : 'Sharing...') : locale === 'th' ? 'เนเธเธฃเนเธซเนเธญเธ' : 'Share Room'}
 </Button>

 <div className='space-y-2'>
 <p className='text-app-caption font-semibold text-slate-600'>{locale === 'th' ? 'เธชเธกเธฒเธเธดเธเนเธเธซเนเธญเธ' : 'Room members'}</p>
 <div className='max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2'>
 {loadingMembers ? (
 <div className='flex items-center justify-center py-2 text-app-caption text-slate-500'><Spinner /> <span className='ml-2'>{locale === 'th' ? 'เธเธณเธฅเธฑเธเนเธซเธฅเธ”...' : 'Loading...'}</span></div>
 ) : members.length === 0 ? (
 <p className='text-center text-app-caption text-slate-500'>{locale === 'th' ? 'เธขเธฑเธเนเธกเนเธกเธตเธชเธกเธฒเธเธดเธ' : 'No members yet'}</p>
 ) : (
 members.map((member) => (
 <div key={member.userId} className='flex items-center justify-between rounded-lg bg-white px-2 py-1.5 text-app-caption'>
 <div className='min-w-0'>
 <p className='truncate font-semibold text-slate-800'>{member.fullName || member.email}</p>
 <p className='truncate text-slate-500'>{member.email}</p>
 </div>
 <span className='rounded-full bg-blue-50 px-2 py-0.5 text-app-micro font-semibold text-blue-700'>
 {member.memberRole === 'owner' ? (locale === 'th' ? 'เน€เธเนเธฒเธเธญเธ' : 'Owner') : locale === 'th' ? 'เธชเธกเธฒเธเธดเธ' : 'Member'}
 </span>
 </div>
 ))
 )}
 </div>
 </div>
 </Card>
 </div>
 </div>
 ) : null}
 </section>
 );
}


