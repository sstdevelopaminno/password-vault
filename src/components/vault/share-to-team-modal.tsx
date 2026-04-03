'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCirclePlus, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';

type TeamRoom = {
 id: string;
 name: string;
 description?: string;
};

type ShareToTeamModalProps = {
 open: boolean;
 itemId: string;
 itemTitle: string;
 onClose: () => void;
 onShared: () => void;
};

export function ShareToTeamModal({ open, itemId, itemTitle, onClose, onShared }: ShareToTeamModalProps) {
 const router = useRouter();
 const { t, locale } = useI18n();
 const { showToast } = useToast();

 const [rooms, setRooms] = useState<TeamRoom[]>([]);
 const [selectedRoomId, setSelectedRoomId] = useState('');
 const [note, setNote] = useState('');
 const [loadingRooms, setLoadingRooms] = useState(false);
 const [sharing, setSharing] = useState(false);

 useEffect(() => {
 if (!open) return;

 setLoadingRooms(true);
 fetch('/api/team-rooms', { cache: 'no-store' })
 .then(async (res) => {
 const body = (await res.json().catch(() => ({}))) as {
 error?: string;
 rooms?: Array<{ id: string; name: string; description?: string }>;
 };

 if (!res.ok) {
 showToast(body.error ?? 'Failed to load team rooms', 'error');
 setRooms([]);
 return;
 }

 const mapped = (body.rooms ?? []).map((room) => ({
 id: room.id,
 name: room.name,
 description: room.description ?? '',
 }));

 setRooms(mapped);
 if (mapped.length > 0) setSelectedRoomId((prev) => (prev && mapped.some((r) => r.id === prev) ? prev : mapped[0].id));
 })
 .catch(() => {
 showToast('Failed to load team rooms', 'error');
 setRooms([]);
 })
 .finally(() => setLoadingRooms(false));
 }, [open, showToast]);

 const selectedRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId) ?? null, [rooms, selectedRoomId]);

 async function submitShare() {
 if (!selectedRoomId || sharing) return;
 setSharing(true);

 const res = await fetch('/api/team-rooms/' + encodeURIComponent(selectedRoomId) + '/share-vault-item', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ vaultItemId: itemId, note }),
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setSharing(false);

 if (!res.ok) {
 showToast(body.error ?? 'Share failed', 'error');
 return;
 }

 showToast(locale === 'th' ? 'แชร์เข้าทีมสำเร็จ' : 'Shared to team room', 'success');
 onShared();
 onClose();
 setNote('');
 }

 if (!open) return null;

 return (
 <div className='fixed inset-0 z-[75] bg-slate-950/45 p-3 backdrop-blur-[2px]'>
 <div className='mx-auto mt-8 w-full max-w-[480px] animate-slide-up rounded-[28px] bg-white p-4 shadow-2xl'>
 <div className='mb-3 flex items-center justify-between'>
 <h2 className='inline-flex items-center gap-2 text-base font-semibold'>
 <MessageCirclePlus className='h-5 w-5 text-blue-600' />
 {locale === 'th' ? 'แชร์รายการเข้าห้องทีม' : 'Share to Team Room'}
 </h2>
 <button onClick={onClose} className='rounded-full p-1 text-slate-500 hover:bg-slate-100' aria-label={t('addItem.closeAria')}>
 <X className='h-5 w-5' />
 </button>
 </div>

 <Card className='space-y-3'>
 <div className='rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900'>
 <p className='font-medium'>{itemTitle}</p>
 <p className='text-xs text-blue-700'>{locale === 'th' ? 'เลือกรหัสทีมปลายทางเพื่อแชร์ข้อมูลนี้' : 'Select a destination team room'}</p>
 </div>

 {loadingRooms ? (
 <div className='flex items-center justify-center py-4 text-sm text-slate-500'>
 <Spinner />
 <span className='ml-2'>{locale === 'th' ? 'กำลังโหลดห้องทีม...' : 'Loading rooms...'}</span>
 </div>
 ) : null}

 {!loadingRooms && rooms.length === 0 ? (
 <div className='space-y-3'>
 <p className='text-sm text-slate-600'>{locale === 'th' ? 'ยังไม่มีห้องทีม กรุณาสร้างห้องก่อน' : 'No team rooms yet. Create one first.'}</p>
 <Button
 type='button'
 onClick={() => {
 onClose();
 router.push('/org-shared');
 }}
 className='w-full'
 >
 {locale === 'th' ? 'ไปสร้างห้องทีม' : 'Go create room'}
 </Button>
 </div>
 ) : null}

 {!loadingRooms && rooms.length > 0 ? (
 <>
 <div className='max-h-40 space-y-2 overflow-y-auto pr-1'>
 {rooms.map((room) => (
 <button
 key={room.id}
 type='button'
 onClick={() => setSelectedRoomId(room.id)}
 className={
 'w-full rounded-xl border px-3 py-2 text-left transition ' +
 (room.id === selectedRoomId
 ? 'border-blue-400 bg-blue-50 text-blue-800'
 : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')
 }
 >
 <p className='text-sm font-semibold'>{room.name}</p>
 {room.description ? <p className='text-xs text-slate-500'>{room.description}</p> : null}
 </button>
 ))}
 </div>

 <div className='space-y-2'>
 <p className='text-xs font-medium text-slate-500'>{locale === 'th' ? 'ข้อความในห้องแชท (ไม่บังคับ)' : 'Chat note (optional)'}</p>
 <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={locale === 'th' ? 'พิมพ์ข้อความประกอบการแชร์' : 'Write a short note'} />
 </div>

 <div className='flex items-center justify-between gap-2'>
 <p className='truncate text-xs text-slate-500'>{selectedRoom ? selectedRoom.name : ''}</p>
 <Button type='button' onClick={() => void submitShare()} disabled={!selectedRoomId || sharing}>
 {sharing ? (
 <span className='inline-flex items-center gap-2'>
 <Spinner /> {locale === 'th' ? 'กำลังแชร์...' : 'Sharing...'}
 </span>
 ) : (
 <span className='inline-flex items-center gap-2'>
 <Send className='h-4 w-4' />
 {locale === 'th' ? 'แชร์เข้าทีม' : 'Share'}
 </span>
 )}
 </Button>
 </div>
 </>
 ) : null}
 </Card>
 </div>
 </div>
 );
}

