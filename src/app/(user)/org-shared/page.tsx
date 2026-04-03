'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, Search, Users2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';

type TeamRoom = {
 id: string;
 name: string;
 description: string;
 updatedAt: string;
 memberRole: 'owner' | 'member';
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

 const loadRooms = useCallback(async () => {
 setLoading(true);
 const res = await fetch('/api/team-rooms', { cache: 'no-store' });
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
 void loadRooms();
 }, [loadRooms]);

 const filteredRooms = useMemo(() => {
 const keyword = search.trim().toLowerCase();
 if (!keyword) return rooms;
 return rooms.filter((room) => room.name.toLowerCase().includes(keyword) || room.description.toLowerCase().includes(keyword));
 }, [rooms, search]);

 async function createRoom() {
 if (creating) return;
 const name = roomName.trim();
 if (!name) {
 showToast(locale === 'th' ? 'กรุณากรอกชื่อห้องทีม' : 'Please enter room name', 'error');
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

 showToast(locale === 'th' ? 'สร้างห้องทีมสำเร็จ' : 'Room created', 'success');
 setCreateOpen(false);
 setRoomName('');
 setRoomDescription('');
 await loadRooms();
 router.push('/org-shared/' + encodeURIComponent(body.room.id));
 }

 function toDisplayDate(raw: string) {
 if (!raw) return locale === 'th' ? 'เมื่อสักครู่' : 'Just now';
 const parsed = new Date(raw);
 if (Number.isNaN(parsed.getTime())) return locale === 'th' ? 'เมื่อสักครู่' : 'Just now';
 return parsed.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US');
 }


 return (
 <section className='space-y-4 pb-24 pt-2'>
 <header className='space-y-1'>
 <h1 className='text-3xl font-semibold leading-tight text-slate-900'>{locale === 'th' ? 'รหัสทีม' : 'Team Keys'}</h1>
 <p className='text-sm leading-6 text-slate-500'>
 {locale === 'th' ? 'สร้างห้องทีมก่อน แล้วจึงเพิ่ม/แก้ไขรายการในห้องนั้น' : 'Create a team room before adding items.'}
 </p>
 </header>

 <div className='relative'>
 <Search className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
 <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={locale === 'th' ? 'ค้นหาห้องทีม' : 'Search rooms'} className='h-11 rounded-[14px] pl-11 text-[15px]' />
 </div>

 <Button type='button' className='h-11 w-full rounded-xl' onClick={() => setCreateOpen(true)}>
 <span className='inline-flex items-center gap-2'>
 <Plus className='h-4 w-4' />
 {locale === 'th' ? 'สร้างห้องทีมใหม่' : 'Create Team Room'}
 </span>
 </Button>

 {loading ? <p className='text-center text-sm text-slate-500'>{locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}</p> : null}

 {!loading && filteredRooms.length === 0 ? (
 <Card className='space-y-2 rounded-[20px] text-center'>
 <Users2 className='mx-auto h-8 w-8 text-slate-400' />
 <p className='text-sm font-semibold text-slate-700'>{locale === 'th' ? 'ยังไม่มีห้องทีม' : 'No team rooms yet'}</p>
 <p className='text-xs text-slate-500'>{locale === 'th' ? 'เริ่มจากการสร้างห้องแรกของคุณ' : 'Create your first room to continue.'}</p>
 </Card>
 ) : null}

 <div className='space-y-2.5'>
 {filteredRooms.map((room) => (
 <button key={room.id} type='button' onClick={() => router.push('/org-shared/' + encodeURIComponent(room.id))} className='w-full text-left'>
 <Card className='rounded-[20px] p-3.5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(37,99,235,0.12)]'>
 <div className='flex items-start justify-between gap-3'>
 <div className='min-w-0'>
 <h3 className='truncate text-lg font-semibold text-slate-900'>{room.name}</h3>
 <p className='mt-1 text-sm text-slate-500'>{room.description || (locale === 'th' ? 'ไม่มีคำอธิบาย' : 'No description')}</p>
 </div>
 <span className='rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700'>
 {room.memberRole === 'owner' ? (locale === 'th' ? 'เจ้าของ' : 'Owner') : locale === 'th' ? 'สมาชิก' : 'Member'}
 </span>
 </div>
 <div className='mt-2 flex items-center justify-between text-xs text-slate-500'>
 <span>{toDisplayDate(room.updatedAt)}</span>
 <span className='inline-flex items-center gap-1'>
 {locale === 'th' ? 'เปิดห้อง' : 'Open room'} <ArrowRight className='h-3.5 w-3.5' />
 </span>
 </div>
 </Card>
 </button>
 ))}
 </div>

 {createOpen ? (
 <div className='fixed inset-0 z-[75] bg-slate-950/45 p-3 backdrop-blur-[2px]'>
 <div className='mx-auto mt-10 w-full max-w-[460px] animate-slide-up rounded-[28px] bg-white p-4 shadow-2xl'>
 <div className='mb-3 flex items-center justify-between'>
 <h2 className='text-base font-semibold'>{locale === 'th' ? 'สร้างห้องทีมใหม่' : 'Create Team Room'}</h2>
 <button onClick={() => setCreateOpen(false)} className='rounded-full p-1 text-slate-500 hover:bg-slate-100'>
 <X className='h-5 w-5' />
 </button>
 </div>

 <Card className='space-y-3'>
 <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder={locale === 'th' ? 'ชื่อห้องทีม' : 'Room name'} maxLength={80} />
 <Input value={roomDescription} onChange={(e) => setRoomDescription(e.target.value)} placeholder={locale === 'th' ? 'คำอธิบาย (ไม่บังคับ)' : 'Description (optional)'} maxLength={500} />
 <Button type='button' className='w-full' onClick={() => void createRoom()} disabled={creating}>
 {creating ? (locale === 'th' ? 'กำลังสร้าง...' : 'Creating...') : locale === 'th' ? 'สร้างห้อง' : 'Create Room'}
 </Button>
 </Card>
 </div>
 </div>
 ) : null}


 </section>
 );
}

