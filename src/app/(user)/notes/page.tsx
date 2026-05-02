'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { BellRing, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Copy, Edit3, FileText, ImageUp, Languages, Loader2, Plus, Printer, Search, Share2, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { PinModal } from '@/components/vault/pin-modal';
import { useI18n } from '@/i18n/provider';
import { fetchWithSessionRetry } from '@/lib/api-client';
import { getOfflineCache, setOfflineCache } from '@/lib/offline-store';
import { flushOfflineQueue, queueOfflineRequest } from '@/lib/offline-sync';
import { disposeOcrWorker, recognizeImageWithOcr } from '@/lib/ocr-worker';
import { canUseNativePrinter, loadSelectedNativePrinter, printEscPosText80mm } from '@/lib/native-thermal-printer';
import { useOutageState } from '@/lib/outage-detector';
import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';

type NoteItem = {
 id: string;
 title: string;
 content: string;
 reminderAt: string | null;
 meetingAt: string | null;
 createdAt: string;
 updatedAt: string;
 pending?: boolean;
};

type Pagination = {
 page: number;
 limit: number;
 total: number;
 totalPages: number;
 hasPrev: boolean;
 hasNext: boolean;
};

type DueNoticeItem = {
 noteId: string;
 kind: 'reminder' | 'meeting';
 at: string;
 title: string;
};

type CalendarDatePopup = {
 dateKey: string;
 notes: NoteItem[];
 activeNoteId: string;
};

type SaveOverlayState = {
 stage: 'saving' | 'success';
 message: string;
};

type OcrLanguageCode = 'tha+eng' | 'tha' | 'eng';
type DateFieldTarget = 'reminder' | 'meeting';
type DateTimePickerStep = 'date' | 'time';

type DateTimePickerState = {
target: DateFieldTarget;
monthCursor: Date;
selectedDateKey: string;
selectedTime: string;
step: DateTimePickerStep;
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

function dateKeyFromLocalDate(input: Date) {
 const y = input.getFullYear();
 const m = String(input.getMonth() + 1).padStart(2, '0');
 const d = String(input.getDate()).padStart(2, '0');
 return y + '-' + m + '-' + d;
}

function timeValueFromDate(input: Date) {
 const hour = String(input.getHours()).padStart(2, '0');
 const minute = String(input.getMinutes()).padStart(2, '0');
 return hour + ':' + minute;
}

function formatDateTimeDraftLabel(raw: string, isTh: boolean) {
 if (!raw) return isTh ? 'ยังไม่ได้เลือกวันเวลา' : 'No date/time selected';
 const date = new Date(raw);
 if (Number.isNaN(date.getTime())) return isTh ? 'รูปแบบวันเวลาไม่ถูกต้อง' : 'Invalid date/time';
 return date.toLocaleString(isTh ? 'th-TH' : 'en-US', {
 year: 'numeric',
 month: 'long',
 day: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 });
}

function normalizeTimeValue(input: string) {
 if (!input || !/^\d{2}:\d{2}$/.test(input)) return '09:00';
 return input;
}

function safeFilename(input: string) {
 return input.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').slice(0, 80) || 'note';
}

function normalizeSearchInput(raw: string) {
 return raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function notesCacheKey(page: number, q: string) {
 return 'pv_notes_cache_v1:' + page + ':' + normalizeSearchInput(q).toLowerCase();
}

function notesCalendarCacheKey(q: string) {
 return 'pv_notes_calendar_cache_v1:' + normalizeSearchInput(q).toLowerCase();
}

const NATIVE_NOTE_REMINDER_STORAGE_KEY = 'pv_native_note_reminders_v1';
const NATIVE_NOTE_REMINDER_MAX = 240;
const NATIVE_NOTE_REMINDER_HORIZON_MS = 365 * 24 * 60 * 60 * 1000;

type NativeReminderPlan = {
 id: number;
 noteId: string;
 kind: 'reminder' | 'meeting';
 at: string;
 title: string;
 signature: string;
};

function buildNativeReminderId(noteId: string, kind: 'reminder' | 'meeting', at: string) {
 const source = noteId + ':' + kind + ':' + at;
 let hash = 2166136261;
 for (let i = 0; i < source.length; i += 1) {
 hash ^= source.charCodeAt(i);
 hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
 }
 return 100000 + (Math.abs(hash >>> 0) % 2000000000);
}

function readNativeReminderMap() {
 if (typeof window === 'undefined') return {} as Record<string, string>;
 try {
 const raw = window.localStorage.getItem(NATIVE_NOTE_REMINDER_STORAGE_KEY);
 if (!raw) return {};
 const parsed = JSON.parse(raw) as Record<string, string>;
 if (!parsed || typeof parsed !== 'object') return {};
 return parsed;
 } catch {
 return {};
 }
}

function writeNativeReminderMap(value: Record<string, string>) {
 if (typeof window === 'undefined') return;
 try {
 window.localStorage.setItem(NATIVE_NOTE_REMINDER_STORAGE_KEY, JSON.stringify(value));
 } catch {
 // ignore local storage failures
 }
}

function buildNativeReminderPlans(notes: NoteItem[]) {
 const now = Date.now();
 const upperBound = now + NATIVE_NOTE_REMINDER_HORIZON_MS;
 const plans: NativeReminderPlan[] = [];

 for (const note of notes) {
 const candidates: Array<{ kind: 'reminder' | 'meeting'; at: string | null }> = [
 { kind: 'reminder', at: note.reminderAt },
 { kind: 'meeting', at: note.meetingAt },
 ];

 for (const candidate of candidates) {
 if (!candidate.at) continue;
 const when = new Date(candidate.at).getTime();
 if (Number.isNaN(when) || when <= now || when > upperBound) continue;
 const id = buildNativeReminderId(note.id, candidate.kind, candidate.at);
 plans.push({
 id: id,
 noteId: note.id,
 kind: candidate.kind,
 at: candidate.at,
 title: note.title,
 signature: note.id + '|' + candidate.kind + '|' + candidate.at + '|' + note.title,
 });
 }
 }

 plans.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
 return plans.slice(0, NATIVE_NOTE_REMINDER_MAX);
}

export default function NotesPage() {
 const { locale } = useI18n();
 const { showToast } = useToast();
 const isTh = locale === 'th';
 const { isOfflineMode } = useOutageState();
 const wasOfflineRef = useRef(isOfflineMode);
 const runtimeCapabilities = useMemo(() => detectRuntimeCapabilities(), []);
 const isNativeApp = runtimeCapabilities.isCapacitorNative;

 const [notes, setNotes] = useState<NoteItem[]>([]);
 const [calendarNotes, setCalendarNotes] = useState<NoteItem[]>([]);
 const [hasCalendarSnapshot, setHasCalendarSnapshot] = useState(false);
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
 const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [draftTitle, setDraftTitle] = useState('');
 const [draftContent, setDraftContent] = useState('');
 const [draftReminder, setDraftReminder] = useState('');
 const [draftMeeting, setDraftMeeting] = useState('');
 const [saving, setSaving] = useState(false);
 const [saveOverlay, setSaveOverlay] = useState<SaveOverlayState | null>(null);
 const [ocrRunning, setOcrRunning] = useState(false);
 const [ocrProgress, setOcrProgress] = useState(0);
 const [ocrLanguage, setOcrLanguage] = useState<OcrLanguageCode>('tha+eng');
 const [ocrTranslateRunning, setOcrTranslateRunning] = useState(false);
 const [ocrPreviewOpen, setOcrPreviewOpen] = useState(false);
 const [ocrPreviewText, setOcrPreviewText] = useState('');
 const [dateTimePickerState, setDateTimePickerState] = useState<DateTimePickerState | null>(null);

 const [deleteTarget, setDeleteTarget] = useState<NoteItem | null>(null);
 const [pendingEditPinTarget, setPendingEditPinTarget] = useState<NoteItem | null>(null);
 const [pendingDeletePinTarget, setPendingDeletePinTarget] = useState<NoteItem | null>(null);
 const [pendingViewPinTarget, setPendingViewPinTarget] = useState<NoteItem | null>(null);
 const [pendingSharePinTarget, setPendingSharePinTarget] = useState<NoteItem | null>(null);
 const [pendingCopyPinTarget, setPendingCopyPinTarget] = useState<NoteItem | null>(null);
 const [pendingPdfPinTarget, setPendingPdfPinTarget] = useState<NoteItem | null>(null);
 const [paperPreviewNote, setPaperPreviewNote] = useState<NoteItem | null>(null);
 const [calendarDatePopup, setCalendarDatePopup] = useState<CalendarDatePopup | null>(null);
 const [pendingCalendarDatePin, setPendingCalendarDatePin] = useState<CalendarDatePopup | null>(null);
 const [deleting, setDeleting] = useState(false);
 const [dueQueue, setDueQueue] = useState<DueNoticeItem[]>([]);
 const [activeDueNotice, setActiveDueNotice] = useState<DueNoticeItem | null>(null);
 const paperSectionRef = useRef<HTMLDivElement | null>(null);
 const calendarSectionRef = useRef<HTMLDivElement | null>(null);
 const notesRequestRef = useRef<AbortController | null>(null);
 const calendarRequestRef = useRef<AbortController | null>(null);
 const nativeReminderSyncTimerRef = useRef<number | null>(null);
 const saveOverlayTimerRef = useRef<number | null>(null);
 const imageOcrInputRef = useRef<HTMLInputElement | null>(null);
 const notesRequestVersionRef = useRef(0);
 const calendarRequestVersionRef = useRef(0);
 const backgroundCalendarRefreshTickRef = useRef(0);

 const allKnownNotes = useMemo(() => {
 const map = new Map<string, NoteItem>();
 for (const note of calendarNotes) map.set(note.id, note);
 for (const note of notes) map.set(note.id, note);
 return map;
 }, [calendarNotes, notes]);

useEffect(() => {
 const timer = window.setTimeout(() => setSearchDebounced(normalizeSearchInput(search)), 320);
 return () => window.clearTimeout(timer);
 }, [search]);

 useEffect(() => {
 if (editorOpen) return;
 setOcrPreviewOpen(false);
 setDateTimePickerState(null);
 setScheduleEditorOpen(false);
 }, [editorOpen]);

 const loadNotes = useCallback(
 async (page = pagination.page, q = searchDebounced) => {
 const requestVersion = notesRequestVersionRef.current + 1;
 notesRequestVersionRef.current = requestVersion;
 notesRequestRef.current?.abort();
 const controller = new AbortController();
 notesRequestRef.current = controller;
 setLoading(true);
 const params = new URLSearchParams({
 page: String(page),
 limit: String(pagination.limit),
 });
 if (q) params.set('q', q);
 try {
 const res = await fetchWithSessionRetry(
 '/api/notes?' + params.toString(),
 { cache: 'no-store', signal: controller.signal },
 { attempts: 2, delayMs: 220 },
 );
 const body = (await res.json().catch(() => ({}))) as { error?: string; notes?: NoteItem[]; pagination?: Pagination };
 if (requestVersion !== notesRequestVersionRef.current) return;
 setLoading(false);
 if (!res.ok) {
 if (isOfflineMode) {
 const cached = await getOfflineCache<{ notes: NoteItem[]; pagination?: Pagination }>(notesCacheKey(page, q));
 if (cached?.notes) {
 setNotes(cached.notes);
 if (cached.pagination) setPagination(cached.pagination);
 return;
 }
 }
 showToast(body.error ?? (isTh ? 'โหลดโน้ตไม่สำเร็จ' : 'Failed to load notes'), 'error');
 return;
 }
 setNotes(body.notes ?? []);
 if (body.pagination) setPagination(body.pagination);
 await setOfflineCache(notesCacheKey(page, q), { notes: body.notes ?? [], pagination: body.pagination });
 } catch (error) {
 if (error instanceof DOMException && error.name === 'AbortError') {
 if (requestVersion === notesRequestVersionRef.current) setLoading(false);
 return;
 }
 if (requestVersion !== notesRequestVersionRef.current) return;
 setLoading(false);
 if (isOfflineMode) {
 const cached = await getOfflineCache<{ notes: NoteItem[]; pagination?: Pagination }>(notesCacheKey(page, q));
 if (cached?.notes) {
 setNotes(cached.notes);
 if (cached.pagination) setPagination(cached.pagination);
 return;
 }
 }
 showToast(isTh ? 'โหลดโน้ตไม่สำเร็จ' : 'Failed to load notes', 'error');
 }
 },
 [isOfflineMode, isTh, pagination.limit, pagination.page, searchDebounced, showToast],
 );

 const loadCalendarNotes = useCallback(
 async (q = searchDebounced) => {
 const requestVersion = calendarRequestVersionRef.current + 1;
 calendarRequestVersionRef.current = requestVersion;
 calendarRequestRef.current?.abort();
 const controller = new AbortController();
 calendarRequestRef.current = controller;
 const params = new URLSearchParams({ page: '1', limit: '140' });
 if (q) params.set('q', q);
 try {
 const res = await fetchWithSessionRetry(
 '/api/notes?' + params.toString(),
 { cache: 'no-store', signal: controller.signal },
 { attempts: 2, delayMs: 220 },
 );
 const body = (await res.json().catch(() => ({}))) as { notes?: NoteItem[] };
 if (requestVersion !== calendarRequestVersionRef.current) return;
 if (res.ok) {
 setCalendarNotes(body.notes ?? []);
 setHasCalendarSnapshot(true);
 await setOfflineCache(notesCalendarCacheKey(q), { notes: body.notes ?? [] });
 return;
 }
 } catch (error) {
 if (error instanceof DOMException && error.name === 'AbortError') return;
 if (requestVersion !== calendarRequestVersionRef.current) return;
 // ignore fetch failure
 }
 if (isOfflineMode) {
 const cached = await getOfflineCache<{ notes: NoteItem[] }>(notesCalendarCacheKey(q));
 if (cached?.notes) {
 setCalendarNotes(cached.notes);
 setHasCalendarSnapshot(true);
 }
 }
 },
 [isOfflineMode, searchDebounced],
 );

 const syncNativeNoteReminders = useCallback(
 async (sourceNotes: NoteItem[]) => {
 if (typeof window === 'undefined' || !isNativeApp) return;

 const plans = buildNativeReminderPlans(sourceNotes);
 try {
 const plugin = await import('@capacitor/local-notifications');
 const permission = await plugin.LocalNotifications.checkPermissions();
 const display = String(permission.display ?? '').toLowerCase();
 if (display !== 'granted') return;

 const previousMap = readNativeReminderMap();
 const nextMap: Record<string, string> = {};
 for (const plan of plans) {
 nextMap[String(plan.id)] = plan.signature;
 }

 const cancelIds = Object.keys(previousMap)
 .filter((id) => !(id in nextMap) || nextMap[id] !== previousMap[id])
 .map((id) => Number(id))
 .filter((id) => Number.isFinite(id));

 if (cancelIds.length > 0) {
 await plugin.LocalNotifications.cancel({
 notifications: cancelIds.map((id) => ({ id: id })),
 });
 }

 const scheduleList = plans.filter((plan) => {
 const key = String(plan.id);
 return previousMap[key] !== plan.signature;
 });

 if (scheduleList.length > 0) {
 await plugin.LocalNotifications.schedule({
 notifications: scheduleList.map((plan) => ({
 id: plan.id,
 title: plan.kind === 'meeting'
 ? (isTh ? 'แจ้งเตือนนัดหมาย' : 'Meeting reminder')
 : (isTh ? 'แจ้งเตือนโน้ต' : 'Note reminder'),
 body: plan.title,
 schedule: {
 at: new Date(plan.at),
 allowWhileIdle: true,
 },
 actionTypeId: 'OPEN_APP',
 extra: {
 href: '/notes',
 noteId: plan.noteId,
 kind: plan.kind,
 at: plan.at,
 },
 })),
 });
 }

 writeNativeReminderMap(nextMap);
 } catch {
 // ignore native scheduling failures
 }
 },
 [isNativeApp, isTh],
 );

 useEffect(() => {
 if (typeof window === 'undefined' || !isNativeApp || !hasCalendarSnapshot) return;
 if (nativeReminderSyncTimerRef.current) {
 window.clearTimeout(nativeReminderSyncTimerRef.current);
 }
 nativeReminderSyncTimerRef.current = window.setTimeout(() => {
 void syncNativeNoteReminders(calendarNotes);
 }, 320);

 return () => {
 if (nativeReminderSyncTimerRef.current) {
 window.clearTimeout(nativeReminderSyncTimerRef.current);
 nativeReminderSyncTimerRef.current = null;
 }
 };
 }, [calendarNotes, hasCalendarSnapshot, isNativeApp, syncNativeNoteReminders]);

 useEffect(() => {
 void loadNotes(1, searchDebounced);
 }, [loadNotes, searchDebounced]);

 useEffect(() => {
 if (viewMode === 'calendar' || calendarNotes.length === 0) {
 void loadCalendarNotes(searchDebounced);
 }
 }, [calendarNotes.length, loadCalendarNotes, searchDebounced, viewMode]);

 useEffect(() => {
 const timer = window.setInterval(() => {
 if (viewMode !== 'calendar') {
 void loadNotes(pagination.page, searchDebounced);
 backgroundCalendarRefreshTickRef.current += 1;
 if (backgroundCalendarRefreshTickRef.current % 4 === 0) {
 void loadCalendarNotes(searchDebounced);
 }
 return;
 }
 void loadCalendarNotes(searchDebounced);
 }, 30000);
 return () => window.clearInterval(timer);
 }, [loadCalendarNotes, loadNotes, pagination.page, searchDebounced, viewMode]);

 useEffect(() => {
 if (wasOfflineRef.current && !isOfflineMode) {
 void flushOfflineQueue().then(() => {
 void loadNotes(pagination.page, searchDebounced);
 void loadCalendarNotes(searchDebounced);
 });
 }
 wasOfflineRef.current = isOfflineMode;
 }, [isOfflineMode, loadCalendarNotes, loadNotes, pagination.page, searchDebounced]);

 useEffect(() => {
 return () => {
 void disposeOcrWorker('tha+eng');
 void disposeOcrWorker('tha');
 void disposeOcrWorker('eng');
 notesRequestRef.current?.abort();
 calendarRequestRef.current?.abort();
 if (nativeReminderSyncTimerRef.current) {
 window.clearTimeout(nativeReminderSyncTimerRef.current);
 nativeReminderSyncTimerRef.current = null;
 }
 if (saveOverlayTimerRef.current) {
 window.clearTimeout(saveOverlayTimerRef.current);
 saveOverlayTimerRef.current = null;
 }
 };
 }, []);

 useEffect(() => {
 if (typeof window === 'undefined' || calendarNotes.length === 0) return;

 const scanDueNotices = () => {
 const now = Date.now();
 const lowerBound = now - 10 * 60 * 1000;
 const upperBound = now + 5 * 1000;
 const discovered: DueNoticeItem[] = [];

 for (const note of calendarNotes) {
 const candidates: Array<{ kind: 'reminder' | 'meeting'; at: string | null }> = [
 { kind: 'reminder', at: note.reminderAt },
 { kind: 'meeting', at: note.meetingAt },
 ];

 for (const candidate of candidates) {
 if (!candidate.at) continue;
 const when = new Date(candidate.at).getTime();
 if (Number.isNaN(when) || when < lowerBound || when > upperBound) continue;
 const seenKey = 'pv_note_due_seen_v1:' + note.id + ':' + candidate.kind + ':' + candidate.at;
 if (window.localStorage.getItem(seenKey) === '1') continue;

 try {
 window.localStorage.setItem(seenKey, '1');
 } catch {
 // ignore local storage errors
 }
 discovered.push({
 noteId: note.id,
 kind: candidate.kind,
 at: candidate.at,
 title: note.title,
 });
 }
 }

 if (discovered.length === 0) return;
 discovered.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
 setDueQueue((prev) => {
 const next = [...prev];
 for (const item of discovered.slice(0, 12)) {
 const exists = next.some(
 (entry) => entry.noteId === item.noteId && entry.kind === item.kind && entry.at === item.at,
 );
 if (!exists) next.push(item);
 }
 return next;
 });
 };

 scanDueNotices();
 const timer = window.setInterval(scanDueNotices, 5000);
 return () => window.clearInterval(timer);
 }, [calendarNotes]);

 useEffect(() => {
 if (activeDueNotice || dueQueue.length === 0) return;
 setActiveDueNotice(dueQueue[0]);
 setDueQueue((prev) => prev.slice(1));
 }, [activeDueNotice, dueQueue]);

 useEffect(() => {
 if (typeof window === 'undefined' || !activeDueNotice) return;
 if (!('Notification' in window)) return;
 if (Notification.permission !== 'granted') return;
 try {
 const noticeTitle = activeDueNotice.kind === 'meeting'
 ? (isTh ? 'ถึงเวลานัดหมาย' : 'Meeting due')
 : (isTh ? 'ถึงเวลาแจ้งเตือน' : 'Reminder due');
 const scheduledAt = new Date(activeDueNotice.at).toLocaleString(isTh ? 'th-TH' : 'en-US');
 new Notification(noticeTitle, {
 body: activeDueNotice.title + ' • ' + scheduledAt,
 tag: 'note-due:' + activeDueNotice.noteId + ':' + activeDueNotice.kind + ':' + activeDueNotice.at,
 });
 } catch {
 // ignore notification failures
 }
 }, [activeDueNotice, isTh]);

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

 const dateTimePickerMonthLabel = useMemo(() => {
 if (!dateTimePickerState) return '';
 return dateTimePickerState.monthCursor.toLocaleDateString(isTh ? 'th-TH' : 'en-US', {
 month: 'long',
 year: 'numeric',
 });
 }, [dateTimePickerState, isTh]);

 const dateTimePickerCells = useMemo(() => {
 if (!dateTimePickerState) return [] as Array<Date | null>;
 const year = dateTimePickerState.monthCursor.getFullYear();
 const month = dateTimePickerState.monthCursor.getMonth();
 const first = new Date(year, month, 1);
 const startOffset = (first.getDay() + 6) % 7;
 const daysInMonth = new Date(year, month + 1, 0).getDate();
 const cells: Array<Date | null> = [];
 for (let i = 0; i < startOffset; i += 1) cells.push(null);
 for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
 while (cells.length % 7 !== 0) cells.push(null);
 return cells;
 }, [dateTimePickerState]);

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

 const calendarNotesByDate = useMemo(() => {
 const buckets = new Map<string, Map<string, NoteItem>>();

 const addToBucket = (dateKey: string | null, note: NoteItem) => {
 if (!dateKey) return;
 const existing = buckets.get(dateKey);
 if (existing) {
 existing.set(note.id, note);
 return;
 }
 const bucket = new Map<string, NoteItem>();
 bucket.set(note.id, note);
 buckets.set(dateKey, bucket);
 };

 for (const note of calendarNotes) {
 addToBucket(dateKeyFromIso(note.meetingAt), note);
 addToBucket(dateKeyFromIso(note.reminderAt), note);
 }

 const normalized = new Map<string, NoteItem[]>();
 for (const [dateKey, bucket] of buckets) {
 normalized.set(dateKey, Array.from(bucket.values()));
 }
 return normalized;
 }, [calendarNotes]);

 function openCreate() {
 setEditingId(null);
 setDraftTitle('');
 setDraftContent('');
 setDraftReminder('');
 setDraftMeeting('');
 setSaveOverlay(null);
 setOcrRunning(false);
 setOcrProgress(0);
 setOcrPreviewOpen(false);
 setOcrPreviewText('');
 setDateTimePickerState(null);
 setScheduleEditorOpen(false);
 setEditorOpen(true);
 }

 function openEdit(note: NoteItem) {
 setEditingId(note.id);
 setDraftTitle(note.title);
 setDraftContent(note.content);
 setDraftReminder(toLocalDateTimeInputValue(note.reminderAt));
 setDraftMeeting(toLocalDateTimeInputValue(note.meetingAt));
 setSaveOverlay(null);
 setOcrRunning(false);
 setOcrProgress(0);
 setOcrPreviewOpen(false);
 setOcrPreviewText('');
 setDateTimePickerState(null);
 setScheduleEditorOpen(false);
 setEditorOpen(true);
 }

function clearDateTime(target: DateFieldTarget) {
if (target === 'reminder') {
setDraftReminder('');
 return;
 }
 setDraftMeeting('');
 }

function openDateTimePicker(target: DateFieldTarget) {
const source = target === 'reminder' ? draftReminder : draftMeeting;
const seeded = source ? new Date(source) : new Date();
const base = Number.isNaN(seeded.getTime()) ? new Date() : seeded;
setDateTimePickerState({
target: target,
monthCursor: new Date(base.getFullYear(), base.getMonth(), 1),
selectedDateKey: dateKeyFromLocalDate(base),
selectedTime: timeValueFromDate(base),
step: 'date',
});
}

function moveDateTimePickerStep(next: DateTimePickerStep) {
setDateTimePickerState((prev) => {
if (!prev) return prev;
return {
...prev,
step: next,
};
});
}

 function shiftDateTimePickerMonth(delta: number) {
 setDateTimePickerState((prev) => {
 if (!prev) return prev;
 return {
 ...prev,
 monthCursor: new Date(prev.monthCursor.getFullYear(), prev.monthCursor.getMonth() + delta, 1),
 };
 });
 }

 function confirmDateTimePicker() {
 const snapshot = dateTimePickerState;
 if (!snapshot) return;
 const selectedValue = snapshot.selectedDateKey + 'T' + normalizeTimeValue(snapshot.selectedTime);
 if (snapshot.target === 'reminder') {
 setDraftReminder(selectedValue);
 } else {
 setDraftMeeting(selectedValue);
 }
 setDateTimePickerState(null);
 }

function clearDateTimePickerValue() {
const snapshot = dateTimePickerState;
if (!snapshot) return;
clearDateTime(snapshot.target);
setDateTimePickerState(null);
}

function setDateTimePickerNow() {
const snapshot = dateTimePickerState;
if (!snapshot) return;
const now = new Date();
setDateTimePickerState({
...snapshot,
monthCursor: new Date(now.getFullYear(), now.getMonth(), 1),
selectedDateKey: dateKeyFromLocalDate(now),
selectedTime: timeValueFromDate(now),
});
}

 function showSaveSuccessOverlay(message: string) {
 setSaveOverlay({ stage: 'success', message: message });
 if (saveOverlayTimerRef.current) {
 window.clearTimeout(saveOverlayTimerRef.current);
 }
 saveOverlayTimerRef.current = window.setTimeout(() => {
 setSaveOverlay(null);
 saveOverlayTimerRef.current = null;
 }, 1100);
 }

 function triggerImageOcrPicker() {
 imageOcrInputRef.current?.click();
 }

 function applyOcrPreview(mode: 'append' | 'replace') {
 const text = ocrPreviewText.trim();
 if (!text) return;
 if (mode === 'replace') {
 setDraftContent(text);
 } else {
 setDraftContent((prev) => {
 const current = prev.trim();
 if (!current) return text;
 return current + '\n\n' + text;
 });
 }
 setOcrPreviewOpen(false);
 setOcrPreviewText('');
 showToast(isTh ? 'เพิ่มข้อความจากภาพแล้ว' : 'Image text added', 'success');
 }

 async function handleImageOcrInput(event: ChangeEvent<HTMLInputElement>) {
 const file = event.target.files?.[0] ?? null;
 event.target.value = '';
 if (!file) return;

 setOcrRunning(true);
 setOcrProgress(0);
 try {
 const selectedLanguage = ocrLanguage === 'tha' ? 'tha' : ocrLanguage === 'eng' ? 'eng' : 'tha+eng';
 const extracted = await recognizeImageWithOcr({
 file: file,
 language: selectedLanguage,
 onProgress: (progress) => {
 setOcrProgress(progress);
 },
 });
 if (!extracted) {
 showToast(isTh ? 'ไม่พบข้อความจากภาพ' : 'No text found in image', 'error');
 return;
 }
 setOcrPreviewText(extracted);
 setOcrPreviewOpen(true);
 showToast(isTh ? 'สแกนเสร็จแล้ว ตรวจสอบข้อความก่อนบันทึก' : 'Scan complete. Review text before insert.', 'success');
 } catch {
 showToast(
 isTh ? 'สแกนรูปไม่สำเร็จ กรุณาลองใหม่ (ต้องมีอินเทอร์เน็ตครั้งแรก)' : 'Image scan failed. Please retry (first run needs internet).',
 'error',
 );
 } finally {
 setOcrRunning(false);
 setOcrProgress(0);
 }
 }

 async function translateDraftContent() {
 const sourceText = draftContent.trim();
 if (!sourceText) {
 showToast(isTh ? 'ยังไม่มีข้อความให้แปลงภาษา' : 'No content to translate', 'error');
 return;
 }

 setOcrTranslateRunning(true);
 try {
 const res = await fetchWithSessionRetry(
 '/api/notes/translate',
 {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ text: sourceText, mode: ocrLanguage }),
 },
 { attempts: 2, delayMs: 220 },
 );
 const body = (await res.json().catch(() => ({}))) as { error?: string; text?: string };
 if (!res.ok || !body.text) {
 showToast(body.error ?? (isTh ? 'แปลงภาษาไม่สำเร็จ' : 'Translation failed'), 'error');
 return;
 }
 setDraftContent(body.text.trim());
 showToast(isTh ? 'แปลงภาษาเรียบร้อยแล้ว' : 'Translation completed', 'success');
 } catch {
 showToast(isTh ? 'แปลงภาษาไม่สำเร็จ กรุณาลองใหม่' : 'Translation failed. Please retry.', 'error');
 } finally {
 setOcrTranslateRunning(false);
 }
 }

 function resetPendingPinTargets() {
 setPendingEditPinTarget(null);
 setPendingDeletePinTarget(null);
 setPendingViewPinTarget(null);
 setPendingSharePinTarget(null);
 setPendingCopyPinTarget(null);
 setPendingPdfPinTarget(null);
 }

 function requestEditWithPin(note: NoteItem) {
 resetPendingPinTargets();
 setPendingEditPinTarget(note);
 }

 function requestDeleteWithPin(note: NoteItem) {
 resetPendingPinTargets();
 setPendingDeletePinTarget(note);
 }

 function requestViewWithPin(note: NoteItem) {
 resetPendingPinTargets();
 setPendingViewPinTarget(note);
 }

 function requestShareWithPin(note: NoteItem) {
 resetPendingPinTargets();
 setPendingSharePinTarget(note);
 }

 function requestCopyWithPin(note: NoteItem) {
 resetPendingPinTargets();
 setPendingCopyPinTarget(note);
 }

 function requestPdfWithPin(note: NoteItem) {
 resetPendingPinTargets();
 setPendingPdfPinTarget(note);
 }

 function handleCalendarDateClick(dateKey: string) {
 setSelectedDateKey(dateKey);
 const notesOnDate = calendarNotesByDate.get(dateKey) ?? [];
 if (notesOnDate.length === 0) {
 setCalendarDatePopup(null);
 setPendingCalendarDatePin(null);
 return;
 }
 setPendingCalendarDatePin({
 dateKey: dateKey,
 notes: notesOnDate,
 activeNoteId: notesOnDate[0].id,
 });
 }

 function goToNotesMenu(target: 'paper' | 'calendar' | 'create') {
 if (target === 'create') {
 openCreate();
 return;
 }

 setViewMode(target);
 window.setTimeout(() => {
 const section = target === 'paper' ? paperSectionRef.current : calendarSectionRef.current;
 section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
 }, 90);
 }

 function closeDuePopup() {
 setActiveDueNotice(null);
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
 if (saving) return;
 if (!title) {
 showToast(isTh ? 'กรุณากรอกชื่อโน้ต' : 'Please enter note title', 'error');
 return;
 }
 if (!content) {
 showToast(isTh ? 'กรุณากรอกข้อความโน้ต' : 'Please enter note content', 'error');
 return;
 }

 setSaving(true);
 setSaveOverlay({
 stage: 'saving',
 message: isTh ? 'กำลังบันทึกโน้ต โปรดรอสักครู่...' : 'Saving note, please wait...',
 });
 const payload = {
 title,
 content,
 reminderAt: fromDateTimeInputValue(draftReminder),
 meetingAt: fromDateTimeInputValue(draftMeeting),
 };

const endpoint = editingId ? '/api/notes/' + encodeURIComponent(editingId) : '/api/notes';
const method = editingId ? 'PATCH' : 'POST';
 try {
 if (isOfflineMode) {
 const now = new Date().toISOString();
 const optimisticId = editingId ?? ('offline-note-' + Date.now());
 const optimisticNote: NoteItem = {
 id: optimisticId,
 title: title,
 content: content,
 reminderAt: payload.reminderAt,
 meetingAt: payload.meetingAt,
 createdAt: now,
 updatedAt: now,
 pending: true,
 };
 const nextNotes = editingId
 ? notes.map((note) => (note.id === editingId ? { ...optimisticNote, createdAt: note.createdAt } : note))
 : [optimisticNote, ...notes];
 const nextCalendar = editingId
 ? calendarNotes.map((note) => (note.id === editingId ? { ...optimisticNote, createdAt: note.createdAt } : note))
 : [optimisticNote, ...calendarNotes];
 setNotes(nextNotes);
 setCalendarNotes(nextCalendar);
 await setOfflineCache(notesCacheKey(pagination.page, searchDebounced), { notes: nextNotes, pagination: pagination });
 await setOfflineCache(notesCalendarCacheKey(searchDebounced), { notes: nextCalendar });
 await queueOfflineRequest(
 endpoint,
 method,
 payload,
 { 'Content-Type': 'application/json' },
 { feature: 'notes', label: editingId ? 'Edit note' : 'Create note' },
 );
 setSaving(false);
 showSaveSuccessOverlay(isTh ? 'บันทึกออฟไลน์เรียบร้อย รอซิงก์อัตโนมัติ' : 'Saved offline. Waiting for sync.');
 showToast(isTh ? 'บันทึกแบบออฟไลน์แล้ว รอซิงก์อัตโนมัติ' : 'Saved offline. Waiting for sync.', 'success');
 setEditorOpen(false);
 setEditingId(null);
 return;
 }

 const res = await fetch(endpoint, {
 method,
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 setSaving(false);
 if (!res.ok) {
 setSaveOverlay(null);
 showToast(body.error ?? (isTh ? 'บันทึกโน้ตไม่สำเร็จ' : 'Failed to save note'), 'error');
 return;
 }

 showSaveSuccessOverlay(isTh ? 'บันทึกสำเร็จ' : 'Saved successfully');
 showToast(isTh ? 'บันทึกโน้ตแล้ว' : 'Note saved', 'success');
 setEditorOpen(false);
 setEditingId(null);
 await loadNotes(pagination.page, searchDebounced);
 if (viewMode === 'calendar') await loadCalendarNotes(searchDebounced);
 } catch {
 setSaving(false);
 setSaveOverlay(null);
 showToast(isTh ? 'บันทึกโน้ตไม่สำเร็จ' : 'Failed to save note', 'error');
 }
 }

async function confirmDeleteNote() {
if (!deleteTarget || deleting) return;
setDeleting(true);
 const endpoint = '/api/notes/' + encodeURIComponent(deleteTarget.id);
 if (isOfflineMode) {
 const nextNotes = notes.filter((note) => note.id !== deleteTarget.id);
 const nextCalendar = calendarNotes.filter((note) => note.id !== deleteTarget.id);
 setNotes(nextNotes);
 setCalendarNotes(nextCalendar);
 await setOfflineCache(notesCacheKey(pagination.page, searchDebounced), { notes: nextNotes, pagination: pagination });
 await setOfflineCache(notesCalendarCacheKey(searchDebounced), { notes: nextCalendar });
 await queueOfflineRequest(endpoint, 'DELETE', undefined, undefined, { feature: 'notes', label: 'Delete note' });
 setDeleting(false);
 setDeleteTarget(null);
 showToast(isTh ? 'ลบแบบออฟไลน์แล้ว รอซิงก์อัตโนมัติ' : 'Deleted offline. Waiting for sync.', 'success');
 return;
 }
 const res = await fetch(endpoint, { method: 'DELETE' });
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

 function canShareNoteText(note: NoteItem, text: string) {
 if (!navigator.share) return false;
 if (typeof navigator.canShare === 'function') {
 try {
 return navigator.canShare({ title: note.title, text });
 } catch {
 return false;
 }
 }
 return true;
 }

 async function copyNoteText(note: NoteItem, fromShareFallback = false) {
 try {
 const text = buildShareableText(note);
 if (navigator.clipboard?.writeText) {
 await navigator.clipboard.writeText(text);
 if (fromShareFallback) {
 showToast(isTh ? 'แชร์ไม่ได้ จึงคัดลอกหัวข้อและข้อความให้แล้ว' : 'Share unavailable, copied title and content instead', 'success');
 } else {
 showToast(isTh ? 'คัดลอกหัวข้อและข้อความโน้ตแล้ว' : 'Copied note title and content', 'success');
 }
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
 if (fromShareFallback) {
 showToast(isTh ? 'แชร์ไม่ได้ จึงคัดลอกหัวข้อและข้อความให้แล้ว' : 'Share unavailable, copied title and content instead', 'success');
 } else {
 showToast(isTh ? 'คัดลอกหัวข้อและข้อความโน้ตแล้ว' : 'Copied note title and content', 'success');
 }
 } catch {
 showToast(isTh ? 'คัดลอกข้อความไม่สำเร็จ' : 'Failed to copy note text', 'error');
 }
 }

 async function shareNote(note: NoteItem) {
 try {
 const text = buildShareableText(note);
 const shareReady = canShareNoteText(note, text);

 if (isNativeApp) {
 if (shareReady) {
 try {
 await navigator.share({ title: note.title, text });
 showToast(isTh ? 'แชร์โน้ตแล้ว' : 'Note shared', 'success');
 return;
 } catch (error) {
 if ((error as Error).name === 'AbortError') return;
 }
 }
 await copyNoteText(note, true);
 return;
 }

 if (shareReady) {
 try {
 await navigator.share({ title: note.title, text });
 showToast(isTh ? 'แชร์โน้ตแล้ว' : 'Note shared', 'success');
 return;
 } catch (error) {
 if ((error as Error).name === 'AbortError') return;
 }
 }

 await copyNoteText(note, true);
 } catch {
 showToast(isTh ? 'แชร์ไฟล์ไม่สำเร็จ' : 'Failed to share file', 'error');
 }
 }

async function downloadPdf(note: NoteItem) {
 if (canUseNativePrinter()) {
 const selected = loadSelectedNativePrinter();
 if (selected) {
 try {
 await printEscPosText80mm({
 printer: selected,
 title: note.title || (isTh ? 'โน้ต' : 'Note'),
 body: note.content || '-',
 footerLines: [
 (isTh ? 'อัปเดตล่าสุด: ' : 'Updated: ') + new Date(note.updatedAt).toLocaleString(isTh ? 'th-TH' : 'en-US'),
 ],
 });
 showToast(isTh ? 'ส่งงานพิมพ์ Bluetooth แล้ว' : 'Print job sent to Bluetooth printer.', 'success');
 return;
 } catch (error) {
 showToast(error instanceof Error ? error.message : (isTh ? 'พิมพ์ผ่าน Bluetooth ไม่สำเร็จ' : 'Bluetooth printing failed.'), 'error');
 return;
 }
 }
 }

 try {
 const url = '/api/notes/' + encodeURIComponent(note.id) + '/export?format=pdf&print=1&locale=' + encodeURIComponent(isTh ? 'th-TH' : 'en-US');
 const res = await fetch(url, { method: 'GET' });
 if (!res.ok) throw new Error('pdf_export_failed');
 const blob = await res.blob();
 const objectUrl = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = objectUrl;
 a.download = safeFilename(note.title) + '.pdf';
 document.body.appendChild(a);
 a.click();
 a.remove();
 window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
 } catch {
 try {
 const fallbackUrl = '/api/notes/' + encodeURIComponent(note.id) + '/export?format=pdf&print=1&locale=' + encodeURIComponent(isTh ? 'th-TH' : 'en-US');
 const popup = window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
 if (!popup) {
 window.location.href = fallbackUrl;
 }
 } catch {
 showToast(isTh ? 'ดาวน์โหลด PDF ไม่สำเร็จ' : 'Failed to download PDF', 'error');
 }
 }
 }

 const weekLabels = isTh ? ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
 const ocrLanguageOptions: Array<{ code: OcrLanguageCode; label: string }> = [
 { code: 'tha+eng', label: isTh ? 'ไทย-อังกฤษ' : 'TH-EN' },
 { code: 'tha', label: isTh ? 'ไทย' : 'TH' },
 { code: 'eng', label: isTh ? 'อังกฤษ' : 'EN' },
 ];
 const activeDueNote = activeDueNotice ? allKnownNotes.get(activeDueNotice.noteId) ?? null : null;

 return (
 <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.7rem)] sm:pt-2'>
 <header className='space-y-1'>
 <h1 className='text-app-h1 font-semibold text-slate-900'>{isTh ? 'โน้ต' : 'Notes'}</h1>
 <p className='text-app-body text-slate-600'>
 {isTh ? 'จดบันทึกงาน นัดหมาย และเตือนความจำได้ในหน้าเดียว' : 'Capture work notes, schedules, and reminders in one place'}
 </p>
 </header>

 <div className='grid grid-cols-3 gap-2'>
 <button
 type='button'
 onClick={() => goToNotesMenu('paper')}
 aria-pressed={viewMode === 'paper'}
 className={
 'group flex h-[88px] flex-col items-center justify-center rounded-[18px] border transition active:scale-[0.98] ' +
 (viewMode === 'paper'
 ? 'border-cyan-300/70 bg-[linear-gradient(180deg,rgba(14,68,147,0.56),rgba(37,23,95,0.58))] text-[#dff6ff] shadow-[0_12px_26px_rgba(56,216,255,0.16)]'
 : 'border-[var(--border-soft)] bg-[var(--surface-1)] text-slate-600 hover:border-cyan-300/50 hover:text-slate-900')
 }
 >
 <span className='inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(117,145,220,0.35)] bg-[rgba(8,16,39,0.86)] shadow-[0_6px_16px_rgba(0,0,0,0.24)]'>
 <FileText className='h-4 w-4' />
 </span>
 <span className='mt-2 form-label'>{isTh ? 'กระดาษ' : 'Paper'}</span>
 </button>
 <button
 type='button'
 onClick={() => goToNotesMenu('calendar')}
 aria-pressed={viewMode === 'calendar'}
 className={
 'group flex h-[88px] flex-col items-center justify-center rounded-[18px] border transition active:scale-[0.98] ' +
 (viewMode === 'calendar'
 ? 'border-fuchsia-300/65 bg-[linear-gradient(180deg,rgba(68,41,141,0.62),rgba(20,34,103,0.6))] text-[#f4deff] shadow-[0_12px_26px_rgba(197,68,255,0.18)]'
 : 'border-[var(--border-soft)] bg-[var(--surface-1)] text-slate-600 hover:border-fuchsia-300/50 hover:text-slate-900')
 }
 >
 <span className='inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(117,145,220,0.35)] bg-[rgba(8,16,39,0.86)] shadow-[0_6px_16px_rgba(0,0,0,0.24)]'>
 <Calendar className='h-4 w-4' />
 </span>
 <span className='mt-2 form-label'>{isTh ? 'ปฏิทิน' : 'Calendar'}</span>
 </button>
 <button
 type='button'
 onClick={() => goToNotesMenu('create')}
 className='group flex h-[88px] flex-col items-center justify-center rounded-[18px] border border-fuchsia-300/60 bg-[var(--grad-main)] text-white shadow-[0_12px_30px_rgba(47,123,255,0.34),0_0_28px_rgba(255,62,209,0.28)] transition active:scale-[0.98]'
 >
 <span className='inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shadow-[0_6px_16px_rgba(15,23,42,0.2)] backdrop-blur-[1px]'>
 <Plus className='h-4 w-4' />
 </span>
 <span className='mt-2 form-label'>{isTh ? 'สร้างโน้ตใหม่' : 'Create Note'}</span>
 </button>
 </div>

 <div className='neon-search relative'>
 <Search className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500' />
 <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isTh ? 'ค้นหาโน้ต' : 'Search notes'} className='h-[50px] rounded-[18px] border-transparent bg-transparent pl-11 text-app-body text-slate-900 placeholder:text-slate-500 focus:border-transparent focus:ring-0' />
 </div>

 {viewMode === 'paper' ? (
 <div ref={paperSectionRef} id='notes-paper-section' className='space-y-3 sm:space-y-4'>
 {loading && notes.length === 0 ? <p className='text-center text-app-body text-slate-500'>{isTh ? 'กำลังโหลด...' : 'Loading...'}</p> : null}
 {!loading && notes.length === 0 ? (
 <Card className='space-y-1 border-[var(--border-soft)] bg-[var(--card)] text-center'>
 <p className='text-app-body font-semibold text-slate-900'>{isTh ? 'ยังไม่มีโน้ต' : 'No notes yet'}</p>
 </Card>
 ) : null}
 {notes.map((note) => {
 const updatedLabel = new Date(note.updatedAt).toLocaleString(isTh ? 'th-TH' : 'en-US');
 const reminderLabel = note.reminderAt ? new Date(note.reminderAt).toLocaleString(isTh ? 'th-TH' : 'en-US') : '-';
 const meetingLabel = note.meetingAt ? new Date(note.meetingAt).toLocaleString(isTh ? 'th-TH' : 'en-US') : '-';
 const scheduleTimes = [note.reminderAt, note.meetingAt]
 .filter((value): value is string => Boolean(value))
 .map((value) => new Date(value).getTime())
 .filter((value) => !Number.isNaN(value));
 const nearestFuture = scheduleTimes.filter((value) => value >= Date.now()).sort((a, b) => a - b)[0];
 const statusLabel = note.pending
 ? (isTh ? 'รอซิงก์ข้อมูล' : 'Pending sync')
 : nearestFuture
 ? (isTh ? 'วางแผนล่วงหน้า' : 'Scheduled ahead')
 : (isTh ? 'โน้ตทั่วไป' : 'General note');
 const statusTone = note.pending
 ? 'bg-amber-50 text-amber-700 ring-amber-200'
 : nearestFuture
 ? 'bg-sky-50 text-sky-700 ring-sky-200'
 : 'bg-slate-100 text-slate-700 ring-slate-200';

 return (
 <Card
 key={note.id}
 className='cv-auto space-y-3 rounded-[30px] border border-[var(--border-soft)] bg-[var(--card)] p-3 sm:space-y-3 sm:p-3.5 shadow-[var(--glow-soft)]'
 >
 <div className='flex items-start gap-2.5 sm:gap-3'>
 <span className='inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] text-sky-300 shadow-[0_8px_18px_rgba(15,23,42,0.12)] sm:h-14 sm:w-14'>
 <FileText className='h-[18px] w-[18px] sm:h-5 sm:w-5' />
 </span>
 <div className='min-w-0 flex-1'>
 <div className='flex flex-wrap items-center gap-1.5'>
 <span className={'inline-flex rounded-full px-2.5 py-1 text-app-micro font-semibold ring-1 ' + statusTone}>{statusLabel}</span>
 </div>
 <p className='mt-1 line-clamp-1 text-app-h3 font-semibold text-slate-900'>{note.title}</p>
 <p className='mt-0.5 text-app-caption font-medium leading-5 text-slate-600 sm:mt-1'>{isTh ? 'เอกสารบันทึกสำคัญประจำวัน' : 'Personal note and reminders'}</p>
 <p className='mt-1.5 text-app-micro font-semibold text-slate-500 sm:mt-2'>{isTh ? 'อัปเดตล่าสุด' : 'Updated'} {updatedLabel}</p>
 </div>
 <button
 type='button'
 onClick={() => requestViewWithPin(note)}
 aria-label={isTh ? 'เปิดเนื้อหาแบบกระดาษ' : 'Open paper-style content'}
 className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-1)] text-slate-500 transition hover:border-cyan-300/50 hover:text-sky-400 sm:h-11 sm:w-11'
 >
 <ChevronRight className='h-4 w-4' />
 </button>
 </div>
 <div className='flex flex-wrap gap-1.5 text-app-micro font-medium text-slate-600'>
 <span className='inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface-1)] px-2 py-1 sm:px-2.5'>
 <Clock3 className='h-3.5 w-3.5 text-slate-500' />
 {isTh ? 'เตือน' : 'Reminder'} {reminderLabel}
 </span>
 <span className='inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface-1)] px-2 py-1 sm:px-2.5'>
 <Calendar className='h-3.5 w-3.5 text-slate-500' />
 {isTh ? 'นัดหมาย' : 'Meeting'} {meetingLabel}
 </span>
 </div>
 <div className='flex flex-wrap gap-1.5 sm:gap-2'>
 <Button type='button' size='sm' variant='secondary' className='h-8 w-8 rounded-full border border-[var(--border-soft)] bg-[var(--surface-1)] p-0 text-sky-400 hover:border-cyan-300/50 hover:text-sky-300 sm:h-9 sm:w-9' onClick={() => requestEditWithPin(note)}><Edit3 className='h-3.5 w-3.5 sm:h-4 sm:w-4' /></Button>
 <Button type='button' size='sm' variant='secondary' className='h-8 w-8 rounded-full border border-[rgba(255,105,157,0.36)] bg-[rgba(64,14,44,0.58)] p-0 text-[#ff88b0] hover:border-rose-300/60 hover:text-[#ff92ba] sm:h-9 sm:w-9' onClick={() => requestDeleteWithPin(note)}><Trash2 className='h-3.5 w-3.5 sm:h-4 sm:w-4' /></Button>
 <Button type='button' size='sm' variant='secondary' className='h-8 w-8 rounded-full border border-[var(--border-soft)] bg-[var(--surface-1)] p-0 text-fuchsia-300 hover:border-fuchsia-300/50 hover:text-fuchsia-200 sm:h-9 sm:w-9' onClick={() => requestShareWithPin(note)}><Share2 className='h-3.5 w-3.5 sm:h-4 sm:w-4' /></Button>
 <Button type='button' size='sm' variant='secondary' className='h-8 w-8 rounded-full border border-[var(--border-soft)] bg-[var(--surface-1)] p-0 text-sky-300 hover:border-cyan-300/50 hover:text-sky-200 sm:h-9 sm:w-9' onClick={() => requestCopyWithPin(note)}><Copy className='h-3.5 w-3.5 sm:h-4 sm:w-4' /></Button>
 <Button type='button' size='sm' variant='secondary' className='h-8 rounded-full border border-[var(--border-soft)] bg-[var(--surface-1)] px-2.5 text-app-micro font-semibold text-slate-700 hover:border-cyan-300/45 hover:text-slate-900 sm:h-9 sm:px-3' onClick={() => requestPdfWithPin(note)}>
 <span className='inline-flex items-center gap-1'>
 <Printer className='h-3.5 w-3.5' />
 {canUseNativePrinter() ? (isTh ? 'พิมพ์ Bluetooth' : 'Print Bluetooth') : (isTh ? 'ไฟล์ PDF' : 'PDF file')}
 </span>
 </Button>
 </div>
 </Card>
 );
 })}
 <div className='flex items-center justify-between gap-2'>
 <Button type='button' variant='secondary' className='h-9 rounded-xl px-3 text-app-caption' onClick={() => void loadNotes(pagination.page - 1, searchDebounced)} disabled={!pagination.hasPrev || loading}>{isTh ? 'ก่อนหน้า' : 'Prev'}</Button>
 <p className='text-app-caption font-semibold text-slate-600'>{isTh ? 'หน้า' : 'Page'} {pagination.page} / {pagination.totalPages}</p>
 <Button type='button' variant='secondary' className='h-9 rounded-xl px-3 text-app-caption' onClick={() => void loadNotes(pagination.page + 1, searchDebounced)} disabled={!pagination.hasNext || loading}>{isTh ? 'ถัดไป' : 'Next'}</Button>
 </div>
 </div>
 ) : (
 <div ref={calendarSectionRef} id='notes-calendar-section'>
 <Card className='space-y-3 rounded-[20px]'>
 <div className='flex items-center justify-between gap-2'>
 <Button type='button' variant='secondary' size='sm' className='h-9 rounded-xl px-2.5' onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}><ChevronLeft className='h-4 w-4' /></Button>
 <p className='text-app-body font-semibold text-slate-800'>{monthLabel}</p>
 <Button type='button' variant='secondary' size='sm' className='h-9 rounded-xl px-2.5' onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}><ChevronRight className='h-4 w-4' /></Button>
 </div>
 <div className='grid grid-cols-7 gap-1 text-center text-app-micro font-semibold text-slate-500'>{weekLabels.map((item) => <div key={item}>{item}</div>)}</div>
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
 onClick={() => handleCalendarDateClick(key)}
 className={'relative h-12 rounded-xl border text-app-caption transition ' + (active ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200')}
 >
 {date.getDate()}
 {count > 0 ? <span className='absolute right-1 top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-app-micro font-semibold text-white'>{count}</span> : null}
 </button>
 );
 })}
 </div>
 </Card>
 </div>
 )}

 {calendarDatePopup ? (
 <div className='fixed inset-0 z-[91] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[3px]'>
 <div className='w-full max-w-[760px] animate-slide-up rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl'>
 <div className='flex items-start justify-between gap-3'>
 <div>
 <p className='text-app-caption font-semibold uppercase tracking-[0.1em] text-slate-500'>{isTh ? 'รายการวันเลือก' : 'Selected date notes'}</p>
 <h3 className='mt-1 text-app-h3 font-semibold text-slate-900'>{calendarDatePopup.dateKey}</h3>
 </div>
 <button
 type='button'
 onClick={() => setCalendarDatePopup(null)}
 className='rounded-full p-1 text-slate-500 transition hover:bg-slate-100'
 aria-label={isTh ? 'ปิดรายการวันเลือก' : 'Close selected date notes'}
 >
 <X className='h-5 w-5' />
 </button>
 </div>

 <p className='mt-1 text-app-caption text-slate-500'>
 {isTh ? `ทั้งหมด ${calendarDatePopup.notes.length} รายการ` : `${calendarDatePopup.notes.length} item(s)`}
 </p>

 {calendarDatePopup.notes.length > 1 ? (
 <div className='mt-3 flex gap-2 overflow-x-auto pb-1'>
 {calendarDatePopup.notes.map((note, index) => {
 const active = note.id === calendarDatePopup.activeNoteId;
 return (
 <button
 key={note.id}
 type='button'
 onClick={() =>
 setCalendarDatePopup((prev) => {
 if (!prev) return prev;
 return { ...prev, activeNoteId: note.id };
 })
 }
 className={
 'inline-flex min-w-[130px] shrink-0 items-center rounded-xl border px-3 py-2 text-left text-app-caption font-semibold transition ' +
 (active
 ? 'border-blue-300 bg-blue-50 text-blue-700'
 : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200')
 }
 >
 <span className='line-clamp-2'>{index + 1}. {note.title}</span>
 </button>
 );
 })}
 </div>
 ) : null}

 {(() => {
 const activeNote =
 calendarDatePopup.notes.find((item) => item.id === calendarDatePopup.activeNoteId) ??
 calendarDatePopup.notes[0] ??
 null;
 if (!activeNote) return null;
 return (
 <div className='mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3 sm:px-4'>
 <p className='text-app-body font-semibold text-slate-900'>{activeNote.title}</p>
 {activeNote.pending ? <p className='mt-1 text-app-micro font-semibold text-amber-600'>{isTh ? 'รอซิงก์' : 'Pending sync'}</p> : null}
 <div className='mt-2 flex flex-wrap gap-2 text-app-micro text-slate-500'>
 <p className='inline-flex items-center gap-1'><Clock3 className='h-3 w-3' /> {isTh ? 'เตือน' : 'Reminder'}: {activeNote.reminderAt ? new Date(activeNote.reminderAt).toLocaleString(isTh ? 'th-TH' : 'en-US') : '-'}</p>
 <p className='inline-flex items-center gap-1'><Calendar className='h-3 w-3' /> {isTh ? 'นัดหมาย' : 'Meeting'}: {activeNote.meetingAt ? new Date(activeNote.meetingAt).toLocaleString(isTh ? 'th-TH' : 'en-US') : '-'}</p>
 </div>
 <div className='mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5'>
 <p className='whitespace-pre-wrap break-words text-app-body leading-6 text-slate-700'>{activeNote.content}</p>
 </div>
 <div className='mt-3 flex justify-end'>
 <Button
 type='button'
 variant='secondary'
 size='sm'
 className='h-8 rounded-lg px-3 text-app-micro'
 onClick={() => {
 setCalendarDatePopup(null);
 setPaperPreviewNote(activeNote);
 }}
 >
 {isTh ? 'เปิดแบบกระดาษ A4' : 'Open A4 view'}
 </Button>
 </div>
 </div>
 );
 })()}

 <div className='mt-4 flex justify-end'>
 <Button type='button' variant='secondary' className='rounded-xl px-4' onClick={() => setCalendarDatePopup(null)}>
 {isTh ? 'ปิด' : 'Close'}
 </Button>
 </div>
 </div>
 </div>
 ) : null}

 {pendingCalendarDatePin ? (
 <PinModal
 action='view_secret'
 actionLabel={isTh ? 'เปิดดูรายการวันที่เลือก' : 'View selected date notes'}
 targetItemId={pendingCalendarDatePin.activeNoteId}
 onVerified={() => {
 const target = pendingCalendarDatePin;
 setPendingCalendarDatePin(null);
 if (target) setCalendarDatePopup(target);
 }}
 onClose={() => setPendingCalendarDatePin(null)}
 />
 ) : null}

 {activeDueNotice ? (
 <div className='fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[3px]'>
 <div className='w-full max-w-[460px] animate-slide-up rounded-[26px] border border-sky-200/80 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.32)]'>
 <div className='flex items-start justify-between gap-3'>
 <div className='flex items-center gap-3'>
 <span className='inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-[0_10px_20px_rgba(59,130,246,0.35)]'>
 <BellRing className='h-5 w-5 animate-pulse' />
 </span>
 <div>
 <p className='text-app-h3 font-semibold text-slate-900'>
 {activeDueNotice.kind === 'meeting'
 ? (isTh ? 'แจ้งเตือนนัดหมาย' : 'Meeting reminder')
 : (isTh ? 'แจ้งเตือนรายการโน้ต' : 'Note reminder')}
 </p>
 <p className='text-app-caption text-slate-500'>
 {new Date(activeDueNotice.at).toLocaleString(isTh ? 'th-TH' : 'en-US')}
 </p>
 </div>
 </div>
 <button type='button' onClick={closeDuePopup} className='rounded-lg p-1 text-slate-500 transition hover:bg-slate-100'>
 <X className='h-4 w-4' />
 </button>
 </div>

 <div className='mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5'>
 <p className='line-clamp-1 text-app-body font-semibold text-slate-900'>{activeDueNotice.title}</p>
 <p className='mt-1 text-app-caption leading-5 text-slate-600'>
 {activeDueNote?.content
 ? activeDueNote.content.slice(0, 120) + (activeDueNote.content.length > 120 ? '...' : '')
 : (isTh ? 'รายการนี้พร้อมให้เปิดดูรายละเอียด' : 'This note is ready to open.')}
 </p>
 </div>

 <div className='mt-4 grid grid-cols-2 gap-2'>
 <Button type='button' variant='secondary' className='w-full' onClick={closeDuePopup}>
 {isTh ? 'ปิด' : 'Dismiss'}
 </Button>
 <Button
 type='button'
 className='w-full'
 onClick={() => {
 if (activeDueNote) {
 setViewMode('paper');
 requestEditWithPin(activeDueNote);
 }
 closeDuePopup();
 }}
 >
 {isTh ? 'เปิดโน้ต' : 'Open note'}
 </Button>
 </div>
 </div>
 </div>
 ) : null}

 {paperPreviewNote ? (
 <div className='fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[3px]'>
 <div className='w-full max-w-[920px] animate-slide-up rounded-[26px] border border-slate-200/90 bg-slate-50/95 p-3 shadow-2xl sm:p-4'>
 <div className='mb-3 flex items-start justify-between gap-3'>
 <div>
 <p className='text-app-caption font-semibold uppercase tracking-[0.12em] text-slate-500'>{isTh ? 'มุมมองกระดาษ A4' : 'A4 paper view'}</p>
 <h3 className='mt-1 line-clamp-1 text-app-h3 font-semibold text-slate-900'>{paperPreviewNote.title}</h3>
 </div>
 <button
 type='button'
 onClick={() => setPaperPreviewNote(null)}
 className='rounded-full p-1 text-slate-500 transition hover:bg-slate-200/70'
 aria-label={isTh ? 'ปิดหน้ากระดาษ' : 'Close paper view'}
 >
 <X className='h-5 w-5' />
 </button>
 </div>
 <div className='preserve-white mx-auto w-full max-w-[794px] rounded-[10px] border border-slate-300/90 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.18)]'>
 <div className='max-h-[calc(100dvh-250px)] overflow-y-auto px-5 py-6 sm:px-10 sm:py-10'>
 <h4 className='text-app-h2 font-semibold text-slate-900'>{paperPreviewNote.title}</h4>
 <p className='mt-2 text-app-micro font-medium text-slate-500'>
 {isTh ? 'อัปเดตล่าสุด' : 'Updated'} {new Date(paperPreviewNote.updatedAt).toLocaleString(isTh ? 'th-TH' : 'en-US')}
 </p>
 <div className='mt-6 border-t border-slate-200 pt-5'>
 <p className='whitespace-pre-wrap break-words text-app-body leading-8 text-slate-800'>
 {paperPreviewNote.content}
 </p>
 </div>
 </div>
 </div>
 <div className='mt-3 flex justify-end'>
 <Button type='button' variant='secondary' className='rounded-xl px-4' onClick={() => setPaperPreviewNote(null)}>
 {isTh ? 'ปิด' : 'Close'}
 </Button>
 </div>
 </div>
 </div>
 ) : null}

 {pendingViewPinTarget ? (
 <PinModal
 action='view_secret'
 actionLabel={isTh ? 'เปิดดูเนื้อหาโน้ต' : 'View note content'}
 targetItemId={pendingViewPinTarget.id}
 onVerified={() => {
 const target = pendingViewPinTarget;
 setPendingViewPinTarget(null);
 if (target) setPaperPreviewNote(target);
 }}
 onClose={() => setPendingViewPinTarget(null)}
 />
 ) : null}

 {pendingDeletePinTarget ? (
 <PinModal
 action='delete_secret'
 actionLabel={isTh ? 'ลบโน้ตนี้' : 'Delete this note'}
 targetItemId={pendingDeletePinTarget.id}
 onVerified={() => {
 const target = pendingDeletePinTarget;
 setPendingDeletePinTarget(null);
 if (target) setDeleteTarget(target);
 }}
 onClose={() => setPendingDeletePinTarget(null)}
 />
 ) : null}

 {pendingEditPinTarget ? (
 <PinModal
 action='edit_secret'
 actionLabel={isTh ? 'แก้ไขโน้ตนี้' : 'Edit this note'}
 targetItemId={pendingEditPinTarget.id}
 onVerified={() => {
 const target = pendingEditPinTarget;
 setPendingEditPinTarget(null);
 if (target) openEdit(target);
 }}
 onClose={() => setPendingEditPinTarget(null)}
 />
 ) : null}

 {pendingSharePinTarget ? (
 <PinModal
 action='copy_secret'
 actionLabel={isTh ? 'แชร์โน้ตนี้' : 'Share this note'}
 targetItemId={pendingSharePinTarget.id}
 onVerified={() => {
 const target = pendingSharePinTarget;
 setPendingSharePinTarget(null);
 if (target) void shareNote(target);
 }}
 onClose={() => setPendingSharePinTarget(null)}
 />
 ) : null}

 {pendingCopyPinTarget ? (
 <PinModal
 action='copy_secret'
 actionLabel={isTh ? 'คัดลอกโน้ตนี้' : 'Copy this note'}
 targetItemId={pendingCopyPinTarget.id}
 onVerified={() => {
 const target = pendingCopyPinTarget;
 setPendingCopyPinTarget(null);
 if (target) void copyNoteText(target);
 }}
 onClose={() => setPendingCopyPinTarget(null)}
 />
 ) : null}

 {pendingPdfPinTarget ? (
 <PinModal
 action='copy_secret'
 actionLabel={canUseNativePrinter() ? (isTh ? 'พิมพ์ Bluetooth' : 'Print Bluetooth') : (isTh ? 'บันทึกเป็น PDF' : 'Save as PDF')}
 targetItemId={pendingPdfPinTarget.id}
 onVerified={() => {
 const target = pendingPdfPinTarget;
 setPendingPdfPinTarget(null);
 if (target) void downloadPdf(target);
 }}
 onClose={() => setPendingPdfPinTarget(null)}
 />
 ) : null}

 {deleteTarget ? (
 <div className='fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px]'>
 <div className='w-full max-w-[460px] animate-slide-up rounded-[24px] border border-rose-100 bg-white p-4 shadow-2xl'>
 <h2 className='text-app-h3 font-semibold text-slate-900'>{isTh ? 'ยืนยันการลบโน้ต' : 'Confirm Note Deletion'}</h2>
 <p className='mt-2 text-app-body text-slate-600'>
 {isTh ? 'ต้องการลบโน้ตนี้ใช่หรือไม่' : 'Do you want to delete this note?'}
 <span className='mt-1 block truncate font-semibold text-slate-800'>{deleteTarget.title}</span>
 </p>
 <div className='mt-4 grid grid-cols-2 gap-2'>
 <Button type='button' variant='secondary' className='h-11 w-full rounded-2xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' onClick={() => setDeleteTarget(null)} disabled={deleting}>{isTh ? 'ยกเลิก' : 'Cancel'}</Button>
 <Button type='button' className='h-11 w-full rounded-2xl bg-[linear-gradient(180deg,#ef4444,#dc2626)] text-white shadow-[0_10px_22px_rgba(220,38,38,0.3)] hover:brightness-110' onClick={() => void confirmDeleteNote()} disabled={deleting}>
 {deleting ? (isTh ? 'กำลังลบ...' : 'Deleting...') : isTh ? 'ลบโน้ต' : 'Delete Note'}
 </Button>
 </div>
 </div>
 </div>
 ) : null}

 {editorOpen ? (
 <div className='fixed inset-0 z-[75] overflow-y-auto bg-slate-950/45 p-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-[2px]'>
<div className='mx-auto my-4 w-full max-w-[620px] max-h-[calc(100dvh-28px)] overflow-y-auto animate-slide-up rounded-[28px] bg-white p-4 shadow-2xl sm:p-5'>
 <div className='mb-2 flex items-center justify-between'>
 <h2 className='text-app-h3 font-semibold text-slate-900'>{editingId ? (isTh ? 'แก้ไขโน้ต' : 'Edit Note') : isTh ? 'สร้างโน้ตใหม่' : 'Create Note'}</h2>
 <button type='button' onClick={() => setEditorOpen(false)} disabled={saving} className='rounded-full p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'><X className='h-5 w-5' /></button>
 </div>
<div className='space-y-3'>
{scheduleEditorOpen ? (
<div className='space-y-3'>
<div className='rounded-2xl border border-sky-300/40 bg-[linear-gradient(180deg,rgba(20,41,105,0.94),rgba(17,30,83,0.96))] p-3'>
<div className='flex items-start justify-between gap-2'>
<div>
<label className='form-label text-sky-100'>{isTh ? 'วันเวลาเพิ่มเติม (ไม่บังคับ)' : 'Optional schedules'}</label>
<p className='text-app-micro leading-5 text-sky-200/90'>
{isTh ? 'กำหนดเวลาแจ้งเตือนหรือวันเวลานัดหมายผ่าน Popup ได้จากปุ่มด้านล่าง' : 'Set reminder or meeting schedule by opening the popup from cards below.'}
</p>
</div>
<Button type='button' variant='secondary' size='sm' className='h-8 rounded-lg border-sky-300/50 bg-[rgba(16,31,84,0.86)] px-2.5 text-sky-100 hover:bg-[rgba(26,47,117,0.95)]' onClick={() => setScheduleEditorOpen(false)}>
<ChevronLeft className='mr-1 h-3.5 w-3.5' />
{isTh ? 'กลับ' : 'Back'}
</Button>
</div>
<div className='mt-3 flex items-stretch gap-2'>
<button
type='button'
onClick={() => openDateTimePicker('reminder')}
className='min-w-0 flex-1 rounded-xl border border-sky-300/70 bg-[linear-gradient(180deg,rgba(168,219,255,0.95),rgba(141,206,255,0.96))] px-3 py-2.5 text-left transition hover:border-sky-200 hover:brightness-105'
>
<p className='line-clamp-1 text-app-caption font-semibold text-sky-950'>{isTh ? 'เวลาแจ้งเตือน (ไม่บังคับ)' : 'Reminder time (optional)'}</p>
<p className={'mt-1 line-clamp-1 text-app-body font-semibold ' + (draftReminder ? 'text-slate-900' : 'text-slate-700')}>
{formatDateTimeDraftLabel(draftReminder, isTh)}
</p>
</button>
<button
type='button'
onClick={() => openDateTimePicker('meeting')}
className='min-w-0 flex-1 rounded-xl border border-violet-300/80 bg-[linear-gradient(180deg,rgba(232,224,255,0.98),rgba(219,207,255,0.98))] px-3 py-2.5 text-left transition hover:border-violet-200 hover:brightness-105'
>
<p className='line-clamp-1 text-app-caption font-semibold text-violet-950'>{isTh ? 'วันเวลานัดหมาย (ไม่บังคับ)' : 'Meeting date/time (optional)'}</p>
<p className={'mt-1 line-clamp-1 text-app-body font-semibold ' + (draftMeeting ? 'text-slate-900' : 'text-slate-700')}>
{formatDateTimeDraftLabel(draftMeeting, isTh)}
</p>
</button>
</div>
</div>
<Button type='button' className='h-10 w-full rounded-2xl bg-[linear-gradient(180deg,#2e6bff,#224ecb)] text-white hover:brightness-110' onClick={() => setScheduleEditorOpen(false)}>
{isTh ? 'กลับไปหน้าฟอร์ม' : 'Back to form'}
</Button>
</div>
) : (
<>
<Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder={isTh ? 'ชื่อโน้ต' : 'Note title'} maxLength={140} className='h-11 rounded-2xl' />
<div className='space-y-2 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-2.5'>
<div className='flex flex-wrap items-center justify-between gap-2'>
<p className='form-label text-slate-600'>{isTh ? 'เนื้อหาแบบกระดาษ A4' : 'A4 paper content'}</p>
<div className='flex flex-wrap items-center justify-end gap-1.5'>
<div className='inline-flex items-center rounded-xl border border-slate-200 bg-white p-1'>
{ocrLanguageOptions.map((option) => (
<button
key={option.code}
type='button'
className={
'rounded-lg px-2 py-1 text-app-micro font-semibold transition ' +
(ocrLanguage === option.code
? 'bg-indigo-100 text-indigo-700'
: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700')
}
onClick={() => setOcrLanguage(option.code)}
disabled={ocrRunning || saving}
>
{option.label}
</button>
))}
</div>
<input
ref={imageOcrInputRef}
type='file'
accept='image/*'
capture='environment'
className='hidden'
onChange={handleImageOcrInput}
/>
<Button
type='button'
variant='secondary'
size='sm'
className='h-9 rounded-full border border-sky-300/70 bg-[linear-gradient(180deg,rgba(20,58,140,0.96),rgba(17,42,112,0.96))] px-3 text-app-micro font-semibold text-white hover:brightness-110'
onClick={triggerImageOcrPicker}
disabled={ocrRunning || ocrTranslateRunning || saving}
>
{ocrRunning ? <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' /> : <ImageUp className='mr-1 h-3.5 w-3.5' />}
{isTh ? 'พิมพ์ข้อความผ่าน OCR' : 'OCR text scan'}
</Button>
<Button
type='button'
variant='secondary'
size='sm'
className='h-9 rounded-full border border-violet-300/70 bg-[linear-gradient(180deg,rgba(66,39,156,0.94),rgba(52,31,127,0.94))] px-3 text-app-micro font-semibold text-white hover:brightness-110'
onClick={() => void translateDraftContent()}
disabled={ocrRunning || ocrTranslateRunning || saving}
>
{ocrTranslateRunning ? <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' /> : <Languages className='mr-1 h-3.5 w-3.5' />}
{isTh ? 'แปลภาษา' : 'Translate'}
</Button>
</div>
</div>
<textarea value={draftContent} onChange={(e) => setDraftContent(e.target.value)} placeholder={isTh ? 'ข้อความโน้ต (กระดาษ A4)' : 'Note content (A4 paper)'} className='min-h-[280px] w-full resize-y rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-3 text-app-body text-slate-800 outline-none ring-0 focus:border-[var(--border-strong)]' />
{ocrRunning ? (
<div className='rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2'>
<p className='flex items-center gap-1 text-app-micro font-semibold text-sky-700'>
<Sparkles className='h-3.5 w-3.5' />
{isTh ? 'กำลังสแกนข้อความจากภาพ...' : 'Extracting text from image...'}
</p>
<div className='mt-2 h-1.5 w-full rounded-full bg-sky-100'>
<div className='h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300' style={{ width: Math.max(6, Math.round(ocrProgress * 100)) + '%' }} />
</div>
</div>
) : null}
{ocrTranslateRunning ? (
<div className='rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2'>
<p className='flex items-center gap-1 text-app-micro font-semibold text-violet-700'>
<Languages className='h-3.5 w-3.5' />
{isTh ? 'กำลังแปลงภาษาในเนื้อหา...' : 'Translating content...'}
</p>
</div>
) : null}
<p className='text-app-micro leading-5 text-slate-500'>{isTh ? 'รองรับ OCR ภาษาไทย/อังกฤษ พร้อมพรีวิว และปุ่มแปลงภาษาในเนื้อหาโน้ต' : 'Supports Thai/English OCR with preview and in-note translation.'}</p>
</div>
<div className='rounded-2xl border border-sky-300/35 bg-[linear-gradient(180deg,rgba(18,36,95,0.9),rgba(14,28,74,0.92))] p-3'>
<Button
type='button'
variant='secondary'
className='h-11 w-full justify-start gap-2 rounded-2xl border border-sky-300/60 bg-[linear-gradient(180deg,#2f69ff,#224ec9)] px-3 font-semibold text-white hover:brightness-110'
onClick={() => setScheduleEditorOpen(true)}
disabled={saving}
>
<Calendar className='h-4 w-4 text-white' />
{isTh ? 'วันเวลาเพิ่มเติม (ไม่บังคับ)' : 'Optional date/time'}
</Button>
<div className='mt-2 grid grid-cols-2 gap-2'>
<p className='rounded-xl border border-sky-300/40 bg-[rgba(20,49,132,0.72)] px-2.5 py-2 text-app-micro font-semibold text-sky-100'>{isTh ? 'เตือน:' : 'Reminder:'} {formatDateTimeDraftLabel(draftReminder, isTh)}</p>
<p className='rounded-xl border border-violet-300/40 bg-[rgba(65,42,142,0.7)] px-2.5 py-2 text-app-micro font-semibold text-violet-100'>{isTh ? 'นัดหมาย:' : 'Meeting:'} {formatDateTimeDraftLabel(draftMeeting, isTh)}</p>
</div>
</div>
<div className='mt-3 grid grid-cols-2 gap-2'>
<Button type='button' variant='secondary' className='h-11 w-full rounded-2xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' onClick={() => setEditorOpen(false)} disabled={saving}>{isTh ? 'ยกเลิก' : 'Cancel'}</Button>
<Button type='button' className='h-11 w-full rounded-2xl bg-[linear-gradient(180deg,#1f5fff,#1a47c7)] text-white shadow-[0_10px_22px_rgba(31,95,255,0.28)] hover:brightness-110' onClick={() => void saveNote()} disabled={saving || ocrRunning}>{saving ? (isTh ? 'กำลังบันทึก...' : 'Saving...') : isTh ? 'บันทึก' : 'Save'}</Button>
</div>
</>
)}
 </div>
 </div>
 </div>
 ) : null}
 {ocrPreviewOpen ? (
 <div className='fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[3px]'>
 <div className='w-full max-w-[680px] animate-slide-up rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl'>
 <div className='flex items-start justify-between gap-2'>
 <div>
 <p className='text-app-caption font-semibold uppercase tracking-[0.12em] text-slate-500'>{isTh ? 'พรีวิว OCR' : 'OCR preview'}</p>
 <h3 className='mt-1 text-app-h3 font-semibold text-slate-900'>{isTh ? 'ตรวจสอบข้อความจากภาพก่อนเพิ่มลงโน้ต' : 'Review extracted text before adding'}</h3>
 </div>
 <button type='button' onClick={() => setOcrPreviewOpen(false)} className='rounded-full p-1 text-slate-500 transition hover:bg-slate-100'>
 <X className='h-5 w-5' />
 </button>
 </div>
 <textarea
 value={ocrPreviewText}
 onChange={(event) => setOcrPreviewText(event.target.value)}
 className='mt-3 min-h-[220px] max-h-[46dvh] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-app-body leading-6 text-slate-800 outline-none focus:border-sky-300'
 />
 <div className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3'>
 <Button type='button' variant='secondary' className='w-full' onClick={() => setOcrPreviewOpen(false)}>
 {isTh ? 'ปิด' : 'Close'}
 </Button>
 <Button type='button' variant='secondary' className='w-full' onClick={() => applyOcrPreview('replace')}>
 {isTh ? 'แทนที่ข้อความเดิม' : 'Replace content'}
 </Button>
 <Button type='button' className='w-full' onClick={() => applyOcrPreview('append')}>
 {isTh ? 'เพิ่มต่อท้ายเนื้อหา' : 'Append to content'}
 </Button>
 </div>
 </div>
 </div>
 ) : null}
 {dateTimePickerState ? (
 <div className='fixed inset-0 z-[97] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[3px]'>
 <div className='w-full max-w-[420px] animate-slide-up rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl'>
 <div className='flex items-start justify-between gap-2'>
 <div>
 <p className='text-app-caption font-semibold uppercase tracking-[0.12em] text-slate-500'>{isTh ? 'เลือกวันเวลา' : 'Pick date/time'}</p>
 <h3 className='mt-1 text-app-h3 font-semibold text-slate-900'>
 {dateTimePickerState.target === 'reminder'
 ? (isTh ? 'เวลาแจ้งเตือน' : 'Reminder time')
 : (isTh ? 'วันเวลานัดหมาย' : 'Meeting time')}
 </h3>
 </div>
 <button type='button' onClick={() => setDateTimePickerState(null)} className='rounded-full p-1 text-slate-500 transition hover:bg-slate-100'>
 <X className='h-5 w-5' />
 </button>
 </div>
 <div className='mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3'>
 <div className='mb-2 flex items-center justify-between gap-2'>
 <Button type='button' variant='secondary' size='sm' className='h-8 rounded-lg px-2.5' onClick={() => shiftDateTimePickerMonth(-1)}>
 <ChevronLeft className='h-4 w-4' />
 </Button>
 <p className='text-app-body font-semibold text-slate-800'>{dateTimePickerMonthLabel}</p>
 <Button type='button' variant='secondary' size='sm' className='h-8 rounded-lg px-2.5' onClick={() => shiftDateTimePickerMonth(1)}>
 <ChevronRight className='h-4 w-4' />
 </Button>
 </div>
 <div className='grid grid-cols-7 gap-1 text-center text-app-micro font-semibold text-slate-500'>
 {weekLabels.map((item, index) => <div key={item + String(index)}>{item}</div>)}
 </div>
{dateTimePickerState.step === 'date' ? (
<>
<div className='mt-1 grid grid-cols-7 gap-1'>
{dateTimePickerCells.map((date, index) => {
if (!date) return <div key={'picker-empty-' + String(index)} className='h-9 rounded-lg border border-transparent' />;
const key = dateKeyFromLocalDate(date);
const active = key === dateTimePickerState.selectedDateKey;
return (
<button
key={key}
type='button'
onClick={() => setDateTimePickerState((prev) => (prev ? { ...prev, selectedDateKey: key } : prev))}
className={
'h-9 rounded-lg border text-app-caption transition ' +
(active ? 'border-sky-300 bg-sky-100 text-sky-800' : 'border-slate-200 bg-white text-slate-700 hover:border-sky-200')
}
>
{date.getDate()}
</button>
);
})}
</div>
<p className='mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-app-caption text-slate-600'>
{isTh ? 'วันที่เลือก:' : 'Selected date:'} {dateTimePickerState.selectedDateKey}
</p>
</>
) : (
<div className='mt-2 space-y-2'>
<p className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-app-caption font-semibold text-slate-700'>
{isTh ? 'วันที่:' : 'Date:'} {dateTimePickerState.selectedDateKey}
</p>
<label className='form-label text-slate-600'>{isTh ? 'เวลา' : 'Time'}</label>
<input
type='time'
value={dateTimePickerState.selectedTime}
onChange={(event) => setDateTimePickerState((prev) => (prev ? { ...prev, selectedTime: event.target.value } : prev))}
className='h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-app-body text-slate-700 outline-none focus:border-sky-300'
/>
</div>
)}
</div>
{dateTimePickerState.step === 'date' ? (
<div className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3'>
<Button type='button' variant='secondary' className='h-10 w-full rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' onClick={() => setDateTimePickerState(null)}>
{isTh ? 'ยกเลิก' : 'Cancel'}
</Button>
<Button type='button' variant='secondary' className='h-10 w-full rounded-xl border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100' onClick={clearDateTimePickerValue}>
{isTh ? 'ล้างวันเวลา' : 'Clear'}
</Button>
<Button type='button' className='h-10 w-full rounded-xl bg-[linear-gradient(180deg,#1f5fff,#1a47c7)] text-white hover:brightness-110' onClick={() => moveDateTimePickerStep('time')}>
{isTh ? 'ถัดไป: เลือกเวลา' : 'Next: pick time'}
</Button>
</div>
) : (
<div className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4'>
<Button type='button' variant='secondary' className='h-10 w-full rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' onClick={() => moveDateTimePickerStep('date')}>
{isTh ? 'ย้อนกลับ' : 'Back'}
</Button>
<Button type='button' variant='secondary' className='h-10 w-full rounded-xl border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100' onClick={setDateTimePickerNow}>
{isTh ? 'ตอนนี้' : 'Now'}
</Button>
<Button type='button' variant='secondary' className='h-10 w-full rounded-xl border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100' onClick={clearDateTimePickerValue}>
{isTh ? 'ล้างวันเวลา' : 'Clear'}
</Button>
<Button type='button' className='h-10 w-full rounded-xl bg-[linear-gradient(180deg,#1f5fff,#1a47c7)] text-white hover:brightness-110' onClick={confirmDateTimePicker}>
{isTh ? 'ยืนยันวันเวลา' : 'Apply'}
</Button>
</div>
)}
 </div>
 </div>
 ) : null}
 {saveOverlay ? (
 <div className='pointer-events-none fixed inset-0 z-[98] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]'>
 <div className='w-full max-w-[320px] animate-slide-up rounded-3xl border border-white/50 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.28)]'>
 <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-[0_10px_25px_rgba(59,130,246,0.4)]'>
 {saveOverlay.stage === 'saving' ? <Loader2 className='h-6 w-6 animate-spin' /> : <CheckCircle2 className='h-6 w-6' />}
 </div>
 <p className='mt-3 text-center text-app-h3 font-semibold text-slate-900'>{saveOverlay.stage === 'saving' ? (isTh ? 'กำลังบันทึก' : 'Saving') : (isTh ? 'สำเร็จ' : 'Success')}</p>
 <p className='mt-1 text-center text-app-body leading-6 text-slate-600'>{saveOverlay.message}</p>
 </div>
 </div>
 ) : null}
 </section>
 );
}


