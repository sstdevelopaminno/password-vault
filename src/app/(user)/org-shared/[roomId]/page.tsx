'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, MessageSquareOff, Search, Send } from 'lucide-react';
import { VaultCard } from '@/components/vault/vault-card';
import { AddVaultItemSheet } from '@/components/vault/add-item-sheet';
import { VaultItemModal } from '@/components/vault/vault-item-modal';
import { PinModal } from '@/components/vault/pin-modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';

type RoomInfo = { id: string; name: string; description: string };
type TeamItem = { id: string; title: string; username: string; updatedAt: string; category: string; url?: string };
type MessageRow = { id: string; senderName: string; messageType: 'text' | 'shared_item'; body: string; metadata?: { title?: string }; createdAt: string };

type EditFormValue = { title: string; username: string; secret?: string; url?: string; category?: string; notes?: string };
type PendingEdit = { id: string; payload: EditFormValue };
type SecureAction = 'edit_secret' | 'delete_secret';
type AssertionCacheEntry = { token: string; expiresAt: number };

const ASSERTION_TTL_MS = 30000;

export default function TeamRoomPage() {
 const params = useParams<{ roomId: string }>();
 const router = useRouter();
 const { showToast } = useToast();
 const { locale } = useI18n();

 const roomId = useMemo(() => {
 if (Array.isArray(params.roomId)) return decodeURIComponent(params.roomId[0] ?? '');
 return decodeURIComponent(params.roomId ?? '');
 }, [params.roomId]);

 const [room, setRoom] = useState<RoomInfo | null>(null);
 const [items, setItems] = useState<TeamItem[]>([]);
 const [messages, setMessages] = useState<MessageRow[]>([]);
 const [search, setSearch] = useState('');
 const [loading, setLoading] = useState(false);
 const [sending, setSending] = useState(false);
 const [chatInput, setChatInput] = useState('');
 const [chatHidden, setChatHidden] = useState(true);

 const [editingItem, setEditingItem] = useState<TeamItem | null>(null);
 const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
 const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
 const [mutating, setMutating] = useState(false);
 const [assertions, setAssertions] = useState<Partial<Record<SecureAction, AssertionCacheEntry>>>({});

 const toDisplayDate = useCallback((raw?: string) => {
 if (!raw) return locale === 'th' ? 'เน€เธกเธทเนเธญเธชเธฑเธเธเธฃเธนเน' : 'Just now';
 const parsed = new Date(raw);
 if (Number.isNaN(parsed.getTime())) return locale === 'th' ? 'เน€เธกเธทเนเธญเธชเธฑเธเธเธฃเธนเน' : 'Just now';
 return parsed.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US');
 }, [locale]);

 const getCachedAssertion = useCallback((action: SecureAction) => {
 const hit = assertions[action];
 if (!hit) return null;
 if (hit.expiresAt <= Date.now()) return null;
 return hit.token;
 }, [assertions]);

 const setCachedAssertion = useCallback((action: SecureAction, token: string) => {
 setAssertions((prev) => ({ ...prev, [action]: { token, expiresAt: Date.now() + ASSERTION_TTL_MS } }));
 }, []);

 const loadAll = useCallback(async () => {
 if (!roomId) return;
 setLoading(true);
 const [roomRes, itemsRes, msgRes] = await Promise.all([
 fetch('/api/team-rooms/' + encodeURIComponent(roomId), { cache: 'no-store' }),
 fetch('/api/team-rooms/' + encodeURIComponent(roomId) + '/items?limit=50&page=1', { cache: 'no-store' }),
 fetch('/api/team-rooms/' + encodeURIComponent(roomId) + '/messages?limit=80', { cache: 'no-store' }),
 ]);
 const roomBody = (await roomRes.json().catch(() => ({}))) as { error?: string; room?: { id: string; name: string; description?: string } };
 const itemsBody = (await itemsRes.json().catch(() => ({}))) as { error?: string; items?: Array<{ id: string; title: string; username?: string; updated_at?: string; category?: string | null; url?: string | null }> };
 const msgBody = (await msgRes.json().catch(() => ({}))) as { error?: string; messages?: Array<{ id: string; senderName?: string; messageType?: 'text' | 'shared_item'; body?: string; metadata?: { title?: string }; createdAt?: string }> };
 setLoading(false);

 if (!roomRes.ok || !roomBody.room) {
 showToast(roomBody.error ?? 'Room not found', 'error');
 router.push('/org-shared');
 return;
 }

 setRoom({ id: roomBody.room.id, name: roomBody.room.name, description: roomBody.room.description ?? '' });
 setItems((itemsBody.items ?? []).map((item) => ({
 id: item.id,
 title: item.title,
 username: item.username ?? '',
 updatedAt: toDisplayDate(item.updated_at),
 category: item.category ?? (locale === 'th' ? 'เธ—เธฑเนเธงเนเธ' : 'General'),
 url: item.url ?? undefined,
 })));

 setMessages((msgBody.messages ?? []).map((msg) => ({
 id: msg.id,
 senderName: msg.senderName ?? 'Member',
 messageType: msg.messageType ?? 'text',
 body: msg.body ?? '',
 metadata: msg.metadata ?? {},
 createdAt: msg.createdAt ?? '',
 })));
 }, [locale, roomId, router, showToast, toDisplayDate]);

 useEffect(() => {
 void loadAll();
 }, [loadAll]);


 async function performDelete(itemId: string, assertionToken: string) {
 setMutating(true);
 const res = await fetch('/api/team-room-items/' + encodeURIComponent(itemId), { method: 'DELETE', headers: { 'x-pin-assertion': assertionToken } });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setMutating(false);
 if (!res.ok) {
 showToast(body.error ?? 'Delete failed', 'error');
 return;
 }
 showToast(locale === 'th' ? 'เธฅเธเธฃเธฒเธขเธเธฒเธฃเนเธฅเนเธง' : 'Deleted', 'success');
 await loadAll();
 }

 async function performUpdate(target: PendingEdit, assertionToken: string) {
 setMutating(true);
 const res = await fetch('/api/team-room-items/' + encodeURIComponent(target.id), {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json', 'x-pin-assertion': assertionToken },
 body: JSON.stringify(target.payload),
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setMutating(false);
 if (!res.ok) {
 showToast(body.error ?? 'Update failed', 'error');
 return;
 }
 showToast(locale === 'th' ? 'เธญเธฑเธเน€เธ”เธ•เธฃเธฒเธขเธเธฒเธฃเนเธฅเนเธง' : 'Updated', 'success');
 await loadAll();
 }

 async function sendMessage() {
 const bodyText = chatInput.trim();
 if (!roomId || !bodyText || sending) return;
 setSending(true);
 const res = await fetch('/api/team-rooms/' + encodeURIComponent(roomId) + '/messages', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ body: bodyText }),
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setSending(false);
 if (!res.ok) {
 showToast(body.error ?? 'Send message failed', 'error');
 return;
 }
 setChatInput('');
 await loadAll();
 }

 const filteredItems = useMemo(() => {
 const keyword = search.trim().toLowerCase();
 if (!keyword) return items;
 return items.filter((item) => item.title.toLowerCase().includes(keyword) || item.username.toLowerCase().includes(keyword));
 }, [items, search]);

 return (
 <section className='space-y-4 pb-24 pt-2'>
 <header className='space-y-1.5'>
 <div className='flex items-start justify-between gap-2'>
 <div className='min-w-0'>
 <div className='flex items-center gap-2'>
 <button type='button' className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-700 transition hover:bg-blue-50' onClick={() => router.push('/org-shared')} aria-label={locale === 'th' ? 'เธขเนเธญเธเธเธฅเธฑเธเธฃเธฒเธขเธเธฒเธฃเธซเนเธญเธเธ—เธตเธก' : 'Back to rooms'}>
 <ArrowLeft className='h-4 w-4' />
 </button>
 <h1 className='truncate text-3xl font-semibold leading-tight text-slate-900'>{room?.name ?? (locale === 'th' ? 'เธซเนเธญเธเธ—เธตเธก' : 'Team Room')}</h1>
 </div>
 <p className='pl-10 text-sm leading-6 text-slate-500'>{room?.description || (locale === 'th' ? 'เธเธฑเธ”เธเธฒเธฃเธฃเธซเธฑเธชเธ—เธตเธกเนเธฅเธฐเนเธเธ—เธ เธฒเธขเนเธเธซเนเธญเธเธเธตเน' : 'Manage team items and room chat')}</p>
 </div>

 <Button type='button' variant='secondary' size='sm' className='h-9 shrink-0 rounded-xl px-2.5' onClick={() => setChatHidden((value) => !value)}>
 <span className='inline-flex items-center gap-1 text-xs font-semibold'>
 {chatHidden ? <MessageSquare className='h-3.5 w-3.5' /> : <MessageSquareOff className='h-3.5 w-3.5' />}
 {chatHidden ? (locale === 'th' ? 'เนเธชเธ”เธเนเธเธ—' : 'Show chat') : locale === 'th' ? 'เธเนเธญเธเนเธเธ—' : 'Hide chat'}
 </span>
 </Button>
 </div>
 </header>

 <div className='relative'>
 <Search className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
 <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={locale === 'th' ? 'เธเนเธเธซเธฒเธฃเธฒเธขเธเธฒเธฃเนเธเธซเนเธญเธ' : 'Search items in room'} className='h-11 rounded-[14px] pl-11 text-[15px]' />
 </div>

 {loading && items.length === 0 ? <p className='text-center text-sm text-slate-500'>{locale === 'th' ? 'เธเธณเธฅเธฑเธเนเธซเธฅเธ”...' : 'Loading...'}</p> : null}

 <div className='grid gap-2.5'>
 {filteredItems.map((item) => (
 <VaultCard
 key={item.id}
 id={item.id}
 title={item.title}
 username={item.username}
 updatedAt={item.updatedAt}
 category={item.category}
 onOpen={(id) => router.push('/org-shared/items/' + encodeURIComponent(id))}
 onEdit={(id) => {
 if (mutating) return;
 const found = items.find((it) => it.id === id);
 if (found) setEditingItem(found);
 }}
 onDelete={(id) => {
 if (mutating) return;
 const cached = getCachedAssertion('delete_secret');
 if (cached) {
 void performDelete(id, cached);
 return;
 }
 setPendingDeleteId(id);
 }}
 />
 ))}
 </div>

 {!loading && filteredItems.length === 0 ? <p className='text-center text-sm text-slate-500'>{locale === 'th' ? 'เธขเธฑเธเนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃเนเธเธซเนเธญเธเธเธตเน' : 'No items in this room yet'}</p> : null}

 {chatHidden ? null : (
 <Card className='space-y-3 rounded-[20px]'>
 <div className='flex items-center justify-between'>
 <h2 className='text-sm font-semibold text-slate-900'>{locale === 'th' ? 'เนเธเธ—เธซเนเธญเธเธ—เธตเธก' : 'Team Room Chat'}</h2>
 <span className='text-xs text-slate-500'>{messages.length} {locale === 'th' ? 'เธเนเธญเธเธงเธฒเธก' : 'messages'}</span>
 </div>


 <div className='max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2.5'>
 {messages.length === 0 ? <p className='text-center text-xs text-slate-500'>{locale === 'th' ? 'เธขเธฑเธเนเธกเนเธกเธตเธเนเธญเธเธงเธฒเธกเนเธเธซเนเธญเธ' : 'No messages yet'}</p> : null}
 {messages.map((msg) => (
 <div key={msg.id} className='rounded-xl border border-slate-200 bg-white px-3 py-2'>
 <div className='mb-1 flex items-center justify-between text-[11px] text-slate-500'>
 <span>{msg.senderName}</span>
 <span>{toDisplayDate(msg.createdAt)}</span>
 </div>
 {msg.messageType === 'shared_item' ? (
 <div className='space-y-1'>
 <p className='text-xs font-semibold text-blue-700'>{locale === 'th' ? 'เนเธเธฃเนเธฃเธฒเธขเธเธฒเธฃเน€เธเนเธฒเธซเนเธญเธ' : 'Shared item to room'}</p>
 <p className='text-sm text-slate-700'>{msg.metadata?.title ?? msg.body}</p>
 {msg.body ? <p className='text-xs text-slate-500'>{msg.body}</p> : null}
 </div>
 ) : (
 <p className='text-sm text-slate-700'>{msg.body}</p>
 )}
 </div>
 ))}
 </div>

 <div className='flex items-center gap-2'>
 <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={locale === 'th' ? 'เธเธดเธกเธเนเธเนเธญเธเธงเธฒเธกเธ–เธถเธเธ—เธตเธก...' : 'Type a message...'} />
 <Button type='button' size='sm' className='h-12 rounded-xl px-3' onClick={() => void sendMessage()} disabled={sending || !chatInput.trim()}>
 <Send className='h-4 w-4' />
 </Button>
 </div>
 </Card>
 )}

 <AddVaultItemSheet
 endpoint={'/api/team-rooms/' + encodeURIComponent(roomId) + '/items'}
 onCreated={() => {
 void loadAll();
 }}
 />

 {editingItem ? (
 <VaultItemModal
 mode='edit'
 initialValue={{ title: editingItem.title, username: editingItem.username, url: editingItem.url ?? '', category: editingItem.category }}
 onClose={() => setEditingItem(null)}
 onSubmit={async (value) => {
 if (mutating) return;
 const target: PendingEdit = { id: editingItem.id, payload: value };
 setEditingItem(null);
 const cached = getCachedAssertion('edit_secret');
 if (cached) {
 await performUpdate(target, cached);
 return;
 }
 setPendingEdit(target);
 }}
 />
 ) : null}

 {pendingDeleteId ? (
 <PinModal
 action='delete_secret'
 actionLabel={locale === 'th' ? 'เธฅเธเธฃเธฒเธขเธเธฒเธฃเธเธตเน' : 'Delete this item'}
 targetItemId={pendingDeleteId}
 onVerified={(assertionToken) => {
 const id = pendingDeleteId;
 setPendingDeleteId(null);
 setCachedAssertion('delete_secret', assertionToken);
 if (id) void performDelete(id, assertionToken);
 }}
 onClose={() => setPendingDeleteId(null)}
 />
 ) : null}

 {pendingEdit ? (
 <PinModal
 action='edit_secret'
 actionLabel={locale === 'th' ? 'เนเธเนเนเธเธฃเธฒเธขเธเธฒเธฃเธเธตเน' : 'Edit this item'}
 targetItemId={pendingEdit.id}
 onVerified={(assertionToken) => {
 const target = pendingEdit;
 setPendingEdit(null);
 setCachedAssertion('edit_secret', assertionToken);
 if (target) void performUpdate(target, assertionToken);
 }}
 onClose={() => setPendingEdit(null)}
 />
 ) : null}
 </section>
 );
}
