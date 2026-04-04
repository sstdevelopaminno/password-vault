'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock3, Edit3, FileDown, FileText, Plus, Search, Share2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';

type NoteItem = {
 id: string;
 title: string;
 content: string;
 reminderAt: string | null;
 meetingAt: string | null;
 createdAt: string;
 updatedAt: string;
};

type Pagination = {
 page: number;
 limit: number;
 total: number;
 totalPages: number;
 hasPrev: boolean;
 hasNext: boolean;
};

function toLocalDateTimeInputValue(raw: string | null) {
 if (!raw) return '';
 const date = new Date(raw);
 if (Number.isNaN(date.getTime())) return '';
 const offset = date.getTimezoneOffset();
 const local = new Date(date.getTime() - offset * 60000);
 return local.toISOString().slice(0, 16);
}

function fromDateTimeInputValue(raw: string) {
 if (!raw) return null;
 const date = new Date(raw);
 if (Number.isNaN(date.getTime())) return null;
 return date.toISOString();
}

function dateKeyFromIso(raw: string | null) {
 if (!raw) return null;
 const date = new Date(raw);
 if (Number.isNaN(date.getTime())) return null;
 const y = date.getFullYear();
 const m = String(date.getMonth() + 1).padStart(2, '0');
 const d = String(date.getDate()).padStart(2, '0');
 return y + '-' + m + '-' + d;
}

function safeFilename(input: string) {
 return input.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').slice(0, 80) || 'note';
}

export default function NotesPage() {
 const { locale } = useI18n();
 const { showToast } = useToast();
 const isTh = locale === 'th';

 const [notes, setNotes] = useState<NoteItem[]>([]);
 const [calendarNotes, setCalendarNotes] = useState<NoteItem[]>([]);
 const [pagination, setPagination] = useState<Pagination>({
 page: 1,
 limit: 20,
 total: 0,
 totalPages: 1,
 hasPrev: false,
 hasNext: false,
 });

 const [loading, setLoading] = useState(false);
 const [search, setSearch] = useState('');
 const [searchDebounced, setSearchDebounced] = useState('');
 const [viewMode, setViewMode] = useState<'paper' | 'calendar'>('paper');
 const [monthCursor, setMonthCursor] = useState(() => {
 const now = new Date();
 return new Date(now.getFullYear(), now.getMonth(), 1);
 });
 const [selectedDateKey, setSelectedDateKey] = useState(() => dateKeyFromIso(new Date().toISOString()) ?? '');

 const [editorOpen, setEditorOpen] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [draftTitle, setDraftTitle] = useState('');
 const [draftContent, setDraftContent] = useState('');
 const [draftReminder, setDraftReminder] = useState('');
 const [draftMeeting, setDraftMeeting] = useState('');
 const [saving, setSaving] = useState(false);

 const [deleteTarget, setDeleteTarget] = useState<NoteItem | null>(null);
 const [deleting, setDeleting] = useState(false);

 useEffect(() => {
 const timer = window.setTimeout(() => setSearchDebounced(search.trim()), 260);
 return () => window.clearTimeout(timer);
 }, [search]);

 const loadNotes = useCallback(
 async (page = pagination.page, q = searchDebounced) => {
 setLoading(true);
 const params = new URLSearchParams({
 page: String(page),
 limit: String(pagination.limit),
 });
 if (q) params.set('q', q);
 const res = await fetch('/api/notes?' + params.toString(), { cache: 'no-store' });
 const body = (await res.json().catch(() => ({}))) as { error?: string; notes?: NoteItem[]; pagination?: Pagination };
 setLoading(false);
 if (!res.ok) {
 showToast(body.error ?? (isTh ? 'โหลดโน้ตไม่สำเร็จ' : 'Failed to load notes'), 'error');
 return;
 }
 setNotes(body.notes ?? []);
 if (body.pagination) setPagination(body.pagination);
 },
 [isTh, pagination.limit, pagination.page, searchDebounced, showToast],
 );

 const loadCalendarNotes = useCallback(
 async (q = searchDebounced) => {
 const params = new URLSearchParams({ page: '1', limit: '300' });
 if (q) params.set('q', q);
 const res = await fetch('/api/notes?' + params.toString(), { cache: 'no-store' });
 const body = (await res.json().catch(() => ({}))) as { notes?: NoteItem[] };
 if (res.ok) setCalendarNotes(body.notes ?? []);
 },
 [searchDebounced],
 );

 useEffect(() => {
 void loadNotes(1, searchDebounced);
 }, [loadNotes, searchDebounced]);

 useEffect(() => {
 if (viewMode === 'calendar') void loadCalendarNotes(searchDebounced);
 }, [loadCalendarNotes, searchDebounced, viewMode]);

 useEffect(() => {
 const timer = window.setInterval(() => {
 if (viewMode === 'calendar') {
 void loadCalendarNotes(searchDebounced);
 } else {
 void loadNotes(pagination.page, searchDebounced);
 }
 }, 30000);
 return () => window.clearInterval(timer);
 }, [loadCalendarNotes, loadNotes, pagination.page, searchDebounced, viewMode]);

 const monthLabel = useMemo(
 () =>
 monthCursor.toLocaleDateString(isTh ? 'th-TH' : 'en-US', {
 month: 'long',
 year: 'numeric',
 }),
 [isTh, monthCursor],
 );

 const calendarCells = useMemo(() => {
 const year = monthCursor.getFullYear();
 const month = monthCursor.getMonth();
 const first = new Date(year, month, 1);
 const startOffset = (first.getDay() + 6) % 7;
 const daysInMonth = new Date(year, month + 1, 0).getDate();
 const cells: Array<Date | null> = [];
 for (let i = 0; i < startOffset; i += 1) cells.push(null);
 for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
 while (cells.length % 7 !== 0) cells.push(null);
 return cells;
 }, [monthCursor]);

 const dateCountMap = useMemo(() => {
 const map = new Map<string, number>();
 for (const note of calendarNotes) {
 const meetingKey = dateKeyFromIso(note.meetingAt);
 const reminderKey = dateKeyFromIso(note.reminderAt);
 if (meetingKey) map.set(meetingKey, (map.get(meetingKey) ?? 0) + 1);
 if (reminderKey && reminderKey !== meetingKey) map.set(reminderKey, (map.get(reminderKey) ?? 0) + 1);
 }
 return map;
 }, [calendarNotes]);

 const selectedDateNotes = useMemo(
 () =>
 calendarNotes.filter((note) => {
 const meetingKey = dateKeyFromIso(note.meetingAt);
 const reminderKey = dateKeyFromIso(note.reminderAt);
 return meetingKey === selectedDateKey || reminderKey === selectedDateKey;
 }),
 [calendarNotes, selectedDateKey],
 );

 function openCreate() {
 setEditingId(null);
 setDraftTitle('');
 setDraftContent('');
 setDraftReminder('');
 setDraftMeeting('');
 setEditorOpen(true);
 }

 function openEdit(note: NoteItem) {
 setEditingId(note.id);
 setDraftTitle(note.title);
 setDraftContent(note.content);
 setDraftReminder(toLocalDateTimeInputValue(note.reminderAt));
 setDraftMeeting(toLocalDateTimeInputValue(note.meetingAt));
 setEditorOpen(true);
 }

 function buildShareableText(note: NoteItem) {
 return [
 note.title,
 '',
 note.content,
 '',
 (isTh ? 'อัปเดตล่าสุด' : 'Updated') + ': ' + new Date(note.updatedAt).toLocaleString(isTh ? 'th-TH' : 'en-US'),
 (isTh ? 'เตือน' : 'Reminder') + ': ' + (note.reminderAt ? new Date(note.reminderAt).toLocaleString(isTh ? 'th-TH' : 'en-US') : '-'),
 (isTh ? 'นัดหมาย' : 'Meeting') + ': ' + (note.meetingAt ? new Date(note.meetingAt).toLocaleString(isTh ? 'th-TH' : 'en-US') : '-'),
 ].join('\n');
 }

 async function saveNote() {
 const title = draftTitle.trim();
 const content = draftContent.trim();
 if (!title) {
 showToast(isTh ? 'กรุณากรอกชื่อโน้ต' : 'Please enter note title', 'error');
 return;
 }
 if (!content) {
 showToast(isTh ? 'กรุณากรอกข้อความโน้ต' : 'Please enter note content', 'error');
 return;
 }

 setSaving(true);
 const payload = {
 title,
 content,
 reminderAt: fromDateTimeInputValue(draftReminder),
 meetingAt: fromDateTimeInputValue(draftMeeting),
 };

 const endpoint = editingId ? '/api/notes/' + encodeURIComponent(editingId) : '/api/notes';
 const method = editingId ? 'PATCH' : 'POST';
 const res = await fetch(endpoint, {
 method,
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setSaving(false);
 if (!res.ok) {
 showToast(body.error ?? (isTh ? 'บันทึกโน้ตไม่สำเร็จ' : 'Failed to save note'), 'error');
 return;
 }

 showToast(isTh ? 'บันทึกโน้ตแล้ว' : 'Note saved', 'success');
 setEditorOpen(false);
 setEditingId(null);
 await loadNotes(pagination.page, searchDebounced);
 if (viewMode === 'calendar') await loadCalendarNotes(searchDebounced);
 }

 async function confirmDeleteNote() {
 if (!deleteTarget || deleting) return;
 setDeleting(true);
 const res = await fetch('/api/notes/' + encodeURIComponent(deleteTarget.id), { method: 'DELETE' });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setDeleting(false);
 if (!res.ok) {
 showToast(body.error ?? (isTh ? 'ลบโน้ตไม่สำเร็จ' : 'Failed to delete note'), 'error');
 return;
 }
 showToast(isTh ? 'ลบโน้ตแล้ว' : 'Note deleted', 'success');
 setDeleteTarget(null);
 const targetPage = pagination.page > 1 && notes.length === 1 ? pagination.page - 1 : pagination.page;
 await loadNotes(targetPage, searchDebounced);
 if (viewMode === 'calendar') await loadCalendarNotes(searchDebounced);
 }

 async function shareNote(note: NoteItem) {
 try {
 const text = buildShareableText(note);
 if (navigator.share) {
 try {
 await navigator.share({ title: note.title, text });
 showToast(isTh ? 'แชร์โน้ตแล้ว' : 'Note shared', 'success');
 return;
 } catch (error) {
 if ((error as Error).name === 'AbortError') return;
 }
 }

 if (navigator.clipboard?.writeText) {
 await navigator.clipboard.writeText(text);
 showToast(isTh ? 'คัดลอกข้อความโน้ตไว้แล้ว' : 'Note text copied', 'success');
 return;
 }

 const textarea = document.createElement('textarea');
 textarea.value = text;
 textarea.style.position = 'fixed';
 textarea.style.opacity = '0';
 document.body.appendChild(textarea);
 textarea.focus();
 textarea.select();
 document.execCommand('copy');
 document.body.removeChild(textarea);
 showToast(isTh ? 'คัดลอกข้อความโน้ตไว้แล้ว' : 'Note text copied', 'success');
 } catch {
 showToast(isTh ? 'แชร์ไฟล์ไม่สำเร็จ' : 'Failed to share file', 'error');
 }
 }

 async function downloadText(note: NoteItem) {
 try {
 const blob = new Blob([buildShareableText(note)], { type: 'text/plain;charset=utf-8' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = safeFilename(note.title) + '.txt';
 document.body.appendChild(a);
 a.click();
 a.remove();
 window.setTimeout(() => URL.revokeObjectURL(url), 1200);
 } catch {
 showToast(isTh ? 'ดาวน์โหลดไฟล์ไม่สำเร็จ' : 'Failed to download file', 'error');
 }
 }

 function exportPdf(note: NoteItem) {
 const url = '/api/notes/' + encodeURIComponent(note.id) + '/export?format=pdf&print=1&locale=' + encodeURIComponent(isTh ? 'th-TH' : 'en-US');
 const popup = window.open(url, '_blank', 'noopener,noreferrer');
 if (!popup) {
 window.location.href = url;
 }
 }

 const weekLabels = isTh ? ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

 return (
 <section className='space-y-4 pb-24 pt-2'>
 <header className='space-y-1'>
 <h1 className='text-3xl font-semibold leading-tight text-slate-900'>{isTh ? 'โน้ต' : 'Notes'}</h1>
 <p className='text-sm leading-6 text-slate-500'>
 {isTh ? 'จดบันทึกงาน นัดหมาย และเตือนความจำได้ในหน้าเดียว' : 'Capture work notes, schedules, and reminders in one place'}
 </p>
 </header>

 <div className='grid grid-cols-3 gap-2'>
 <Button type='button' variant={viewMode === 'paper' ? 'default' : 'secondary'} className='h-10 rounded-xl text-xs' onClick={() => setViewMode('paper')}>
 <span className='inline-flex items-center gap-1'>
 <FileText className='h-4 w-4' /> {isTh ? 'กระดาษ' : 'Paper'}
 </span>
 </Button>
 <Button type='button' variant={viewMode === 'calendar' ? 'default' : 'secondary'} className='h-10 rounded-xl text-xs' onClick={() => setViewMode('calendar')}>
 <span className='inline-flex items-center gap-1'>
 <Calendar className='h-4 w-4' /> {isTh ? 'ปฏิทิน' : 'Calendar'}
 </span>
 </Button>
 <Button type='button' className='h-10 rounded-xl text-xs' onClick={openCreate}>
 <span className='inline-flex items-center gap-1'>
 <Plus className='h-4 w-4' /> {isTh ? 'สร้างโน้ตใหม่' : 'Create Note'}
 </span>
 </Button>
 </div>

 <div className='relative'>
 <Search className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
 <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isTh ? 'ค้นหาโน้ต' : 'Search notes'} className='h-11 rounded-[14px] pl-11 text-[15px]' />
 </div>

 {viewMode === 'paper' ? (
 <div className='space-y-2.5'>
 {loading && notes.length === 0 ? <p className='text-center text-sm text-slate-500'>{isTh ? 'กำลังโหลด...' : 'Loading...'}</p> : null}
 {!loading && notes.length === 0 ? (
 <Card className='space-y-1 text-center'>
 <p className='text-sm font-semibold text-slate-700'>{isTh ? 'ยังไม่มีโน้ต' : 'No notes yet'}</p>
 </Card>
 ) : null}
 {notes.map((note) => (
 <Card key={note.id} className='space-y-3 rounded-[20px]'>
 <div className='min-w-0'>
 <p className='line-clamp-1 text-base font-semibold text-slate-900'>{note.title}</p>
 <p className='line-clamp-3 text-sm text-slate-600'>{note.content}</p>
 </div>
 <div className='grid grid-cols-1 gap-1 text-xs text-slate-500'>
 <p>{isTh ? 'อัปเดตล่าสุด' : 'Updated'}: {new Date(note.updatedAt).toLocaleString(isTh ? 'th-TH' : 'en-US')}</p>
 <p>{isTh ? 'เตือน' : 'Reminder'}: {note.reminderAt ? new Date(note.reminderAt).toLocaleString(isTh ? 'th-TH' : 'en-US') : '-'}</p>
 <p>{isTh ? 'นัดหมาย' : 'Meeting'}: {note.meetingAt ? new Date(note.meetingAt).toLocaleString(isTh ? 'th-TH' : 'en-US') : '-'}</p>
 </div>
 <div className='grid grid-cols-6 gap-1.5'>
 <Button type='button' size='sm' variant='secondary' className='h-9 rounded-xl px-0' onClick={() => openEdit(note)}><Edit3 className='h-4 w-4' /></Button>
 <Button type='button' size='sm' variant='secondary' className='h-9 rounded-xl px-0 text-rose-600' onClick={() => setDeleteTarget(note)}><Trash2 className='h-4 w-4' /></Button>
 <Button type='button' size='sm' variant='secondary' className='h-9 rounded-xl px-0' onClick={() => void shareNote(note)}><Share2 className='h-4 w-4' /></Button>
 <Button type='button' size='sm' variant='secondary' className='h-9 rounded-xl px-0' onClick={() => exportPdf(note)}><FileDown className='h-4 w-4' /></Button>
 <Button type='button' size='sm' variant='secondary' className='col-span-2 h-9 rounded-xl text-[11px]' onClick={() => void downloadText(note)}>{isTh ? 'ไฟล์ .txt' : '.txt file'}</Button>
 </div>
 </Card>
 ))}
 <div className='flex items-center justify-between gap-2'>
 <Button type='button' variant='secondary' className='h-9 rounded-xl px-3 text-xs' onClick={() => void loadNotes(pagination.page - 1, searchDebounced)} disabled={!pagination.hasPrev || loading}>{isTh ? 'ก่อนหน้า' : 'Prev'}</Button>
 <p className='text-xs font-semibold text-slate-500'>{isTh ? 'หน้า' : 'Page'} {pagination.page} / {pagination.totalPages}</p>
 <Button type='button' variant='secondary' className='h-9 rounded-xl px-3 text-xs' onClick={() => void loadNotes(pagination.page + 1, searchDebounced)} disabled={!pagination.hasNext || loading}>{isTh ? 'ถัดไป' : 'Next'}</Button>
 </div>
 </div>
 ) : (
 <Card className='space-y-3 rounded-[20px]'>
 <div className='flex items-center justify-between gap-2'>
 <Button type='button' variant='secondary' size='sm' className='h-9 rounded-xl px-2.5' onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}><ChevronLeft className='h-4 w-4' /></Button>
 <p className='text-sm font-semibold text-slate-800'>{monthLabel}</p>
 <Button type='button' variant='secondary' size='sm' className='h-9 rounded-xl px-2.5' onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}><ChevronRight className='h-4 w-4' /></Button>
 </div>
 <div className='grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500'>{weekLabels.map((item) => <div key={item}>{item}</div>)}</div>
 <div className='grid grid-cols-7 gap-1'>
 {calendarCells.map((date, index) => {
 if (!date) return <div key={'empty-' + index} className='h-12 rounded-xl border border-transparent' />;
 const key = dateKeyFromIso(date.toISOString()) ?? '';
 const count = dateCountMap.get(key) ?? 0;
 const active = key === selectedDateKey;
 return (
 <button
 key={key}
 type='button'
 onClick={() => setSelectedDateKey(key)}
 className={'relative h-12 rounded-xl border text-xs transition ' + (active ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200')}
 >
 {date.getDate()}
 {count > 0 ? <span className='absolute right-1 top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white'>{count}</span> : null}
 </button>
 );
 })}
 </div>
 <div className='space-y-2 border-t border-slate-200 pt-2'>
 <p className='text-xs font-semibold text-slate-600'>{isTh ? 'รายการวันที่เลือก' : 'Items on selected date'}: {selectedDateKey || '-'}</p>
 {selectedDateNotes.length === 0 ? <p className='text-xs text-slate-500'>{isTh ? 'ไม่มีรายการนัดหมายในวันนี้' : 'No schedule items on this date'}</p> : selectedDateNotes.map((note) => (
 <div key={note.id} className='rounded-xl border border-slate-200 bg-white px-3 py-2'>
 <p className='text-sm font-semibold text-slate-800'>{note.title}</p>
 <div className='mt-1 space-y-1 text-[11px] text-slate-500'>
 <p className='inline-flex items-center gap-1'><Clock3 className='h-3 w-3' /> {isTh ? 'เตือน' : 'Reminder'}: {note.reminderAt ? new Date(note.reminderAt).toLocaleString(isTh ? 'th-TH' : 'en-US') : '-'}</p>
 <p className='inline-flex items-center gap-1'><Calendar className='h-3 w-3' /> {isTh ? 'นัดหมาย' : 'Meeting'}: {note.meetingAt ? new Date(note.meetingAt).toLocaleString(isTh ? 'th-TH' : 'en-US') : '-'}</p>
 </div>
 </div>
 ))}
 </div>
 </Card>
 )}

 {deleteTarget ? (
 <div className='fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px]'>
 <div className='w-full max-w-[460px] animate-slide-up rounded-[24px] border border-rose-100 bg-white p-4 shadow-2xl'>
 <h2 className='text-base font-semibold text-slate-900'>{isTh ? 'ยืนยันการลบโน้ต' : 'Confirm Note Deletion'}</h2>
 <p className='mt-2 text-sm text-slate-600'>
 {isTh ? 'ต้องการลบโน้ตนี้ใช่หรือไม่' : 'Do you want to delete this note?'}
 <span className='mt-1 block truncate font-semibold text-slate-800'>{deleteTarget.title}</span>
 </p>
 <div className='mt-4 grid grid-cols-2 gap-2'>
 <Button type='button' variant='secondary' className='w-full' onClick={() => setDeleteTarget(null)} disabled={deleting}>{isTh ? 'ยกเลิก' : 'Cancel'}</Button>
 <Button type='button' className='w-full bg-rose-600 hover:bg-rose-700' onClick={() => void confirmDeleteNote()} disabled={deleting}>
 {deleting ? (isTh ? 'กำลังลบ...' : 'Deleting...') : isTh ? 'ลบโน้ต' : 'Delete Note'}
 </Button>
 </div>
 </div>
 </div>
 ) : null}

 {editorOpen ? (
 <div className='fixed inset-0 z-[75] bg-slate-950/45 p-3 backdrop-blur-[2px]'>
 <div className='mx-auto mt-6 w-full max-w-[460px] animate-slide-up rounded-[28px] bg-white p-4 shadow-2xl'>
 <div className='mb-3 flex items-center justify-between'>
 <h2 className='text-base font-semibold'>{editingId ? (isTh ? 'แก้ไขโน้ต' : 'Edit Note') : isTh ? 'สร้างโน้ตใหม่' : 'Create Note'}</h2>
 <button type='button' onClick={() => setEditorOpen(false)} className='rounded-full p-1 text-slate-500 hover:bg-slate-100'><X className='h-5 w-5' /></button>
 </div>
 <div className='space-y-3'>
 <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder={isTh ? 'ชื่อโน้ต' : 'Note title'} maxLength={140} />
 <textarea value={draftContent} onChange={(e) => setDraftContent(e.target.value)} placeholder={isTh ? 'ข้อความโน้ต (กระดาษ A4)' : 'Note content (A4 paper)'} className='min-h-[280px] w-full resize-y rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-3 text-sm text-slate-800 outline-none ring-0 focus:border-[var(--border-strong)]' />
 <label className='text-xs font-medium text-slate-600'>{isTh ? 'เวลาแจ้งเตือน (ไม่บังคับ)' : 'Reminder time (optional)'}</label>
 <Input type='datetime-local' value={draftReminder} onChange={(e) => setDraftReminder(e.target.value)} />
 <label className='text-xs font-medium text-slate-600'>{isTh ? 'วันเวลานัดหมาย (ไม่บังคับ)' : 'Meeting date/time (optional)'}</label>
 <Input type='datetime-local' value={draftMeeting} onChange={(e) => setDraftMeeting(e.target.value)} />
 </div>
 <div className='mt-4 grid grid-cols-2 gap-2'>
 <Button type='button' variant='secondary' className='w-full' onClick={() => setEditorOpen(false)}>{isTh ? 'ยกเลิก' : 'Cancel'}</Button>
 <Button type='button' className='w-full' onClick={() => void saveNote()} disabled={saving}>{saving ? (isTh ? 'กำลังบันทึก...' : 'Saving...') : isTh ? 'บันทึก' : 'Save'}</Button>
 </div>
 </div>
 </div>
 ) : null}
 </section>
 );
}