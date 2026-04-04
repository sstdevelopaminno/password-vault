'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { VaultCard } from '@/components/vault/vault-card';
import { AddVaultItemSheet } from '@/components/vault/add-item-sheet';
import { PinModal } from '@/components/vault/pin-modal';
import { VaultItemModal } from '@/components/vault/vault-item-modal';
import { ShareToTeamModal } from '@/components/vault/share-to-team-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';

type VaultItem = {
 id: string;
 title: string;
 username: string;
 updatedAt: string;
 category: string;
 sharedToTeamCount: number;
 url?: string;
};

type VaultApiItem = {
 id: string;
 title: string;
 username?: string;
 updated_at?: string;
 category?: string | null;
 shared_to_team_count?: number | null;
 url?: string | null;
};

type VaultApiResponse = {
 error?: string;
 items?: VaultApiItem[];
 pagination?: {
 page?: number;
 limit?: number;
 total?: number;
 totalPages?: number;
 hasPrev?: boolean;
 hasNext?: boolean;
 };
};

type EditFormValue = {
 title: string;
 username: string;
 secret?: string;
 url?: string;
 category?: string;
 notes?: string;
};

type PendingEdit = {
 id: string;
 payload: EditFormValue;
};

type SecureAction = 'edit_secret' | 'delete_secret';
type AssertionCacheEntry = { token: string; expiresAt: number };

const PAGE_SIZE = 12;
const ASSERTION_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 12_000;

function clampPage(value: number, totalPages: number) {
 const next = Number.isFinite(value) ? Math.floor(value) : 1;
 return Math.min(Math.max(1, next), Math.max(1, totalPages));
}

function buildPageNumbers(page: number, totalPages: number) {
 if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
 if (page <= 4) return [1, 2, 3, 4, 5];
 if (page >= totalPages - 3) return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
 return [page - 2, page - 1, page, page + 1, page + 2];
}

export default function VaultPage() {
 const router = useRouter();
 const { t, locale } = useI18n();
 const { showToast } = useToast();

 const [items, setItems] = useState<VaultItem[]>([]);
 const [search, setSearch] = useState('');
 const [page, setPage] = useState(1);
 const [totalPages, setTotalPages] = useState(1);
 const [totalItems, setTotalItems] = useState(0);
 const [loadingPage, setLoadingPage] = useState(false);

 const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
 const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
 const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
 const [mutating, setMutating] = useState(false);
 const [sharingItem, setSharingItem] = useState<VaultItem | null>(null);

 const deferredSearch = useDeferredValue(search);
 const requestLockRef = useRef(false);
 const assertionCacheRef = useRef<Partial<Record<SecureAction, AssertionCacheEntry>>>({});

 const toDisplayTime = useCallback(
 (raw?: string) => {
 if (!raw) return t('vault.justNow');
 const parsed = new Date(raw);
 if (Number.isNaN(parsed.getTime())) return t('vault.justNow');
 return parsed.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US');
 },
 [locale, t],
 );

 const mapApiItems = useCallback(
 (source: VaultApiItem[]) =>
 source.map((item) => ({
 id: item.id,
 title: item.title,
 username: item.username ?? '',
 updatedAt: toDisplayTime(item.updated_at),
 category: item.category ?? t('vault.categoryGeneral'),
 sharedToTeamCount: Math.max(0, Number(item.shared_to_team_count ?? 0)),
 url: item.url ?? undefined,
 })),
 [t, toDisplayTime],
 );

 const setCachedAssertion = useCallback((action: SecureAction, token: string) => {
 assertionCacheRef.current[action] = { token, expiresAt: Date.now() + ASSERTION_TTL_MS };
 }, []);

 const getCachedAssertion = useCallback((action: SecureAction) => {
 const hit = assertionCacheRef.current[action];
 if (!hit) return null;
 if (hit.expiresAt <= Date.now()) {
 delete assertionCacheRef.current[action];
 return null;
 }
 return hit.token;
 }, []);

 const clearCachedAssertion = useCallback((action: SecureAction) => {
 delete assertionCacheRef.current[action];
 }, []);

 const handleUnauthorized = useCallback(() => {
 showToast(locale === 'th' ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : 'Session expired. Please sign in again.', 'error');
 router.replace('/login');
 }, [locale, router, showToast]);

 const loadItems = useCallback(
 async (targetPage: number) => {
 if (requestLockRef.current) return;
 requestLockRef.current = true;
 setLoadingPage(true);

 try {
 const safePage = Math.max(1, targetPage);
 const params = new URLSearchParams();
 params.set('limit', String(PAGE_SIZE));
 params.set('page', String(safePage));
 if (deferredSearch.trim()) params.set('q', deferredSearch.trim());

 const controller = new AbortController();
 const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
 let res: Response;
 try {
 res = await fetch('/api/vault?' + params.toString(), { cache: 'no-store', signal: controller.signal });
 } finally {
 window.clearTimeout(timer);
 }

 const body = (await res.json().catch(() => ({}))) as VaultApiResponse;
 if (!res.ok) {
 if (res.status === 401) {
 handleUnauthorized();
 return;
 }
 showToast(body.error ?? t('vaultDetail.loadFailed'), 'error');
 return;
 }

 const mapped = mapApiItems(body.items ?? []);
 const nextTotalPages = Math.max(1, Number(body.pagination?.totalPages ?? 1));
 const nextPage = clampPage(Number(body.pagination?.page ?? safePage), nextTotalPages);
 const nextTotalItems = Math.max(0, Number(body.pagination?.total ?? 0));

 setItems(mapped);
 setTotalPages(nextTotalPages);
 setTotalItems(nextTotalItems);
 if (nextPage !== page) setPage(nextPage);
 } catch (error) {
 if ((error as Error).name === 'AbortError') {
 showToast(locale === 'th' ? 'โหลดข้อมูลช้าเกินไป กรุณาลองอีกครั้ง' : 'Loading timed out. Please retry.', 'error');
 } else {
 showToast(t('vaultDetail.loadFailed'), 'error');
 }
 } finally {
 requestLockRef.current = false;
 setLoadingPage(false);
 }
 },
 [deferredSearch, handleUnauthorized, locale, mapApiItems, page, showToast, t],
 );

 useEffect(() => {
 setPage(1);
 }, [deferredSearch]);

 useEffect(() => {
 void loadItems(page);
 }, [page, deferredSearch, loadItems]);

 const performDelete = useCallback(
 async (targetId: string, assertionToken: string) => {
 setMutating(true);
 const res = await fetch('/api/vault/' + targetId, {
 method: 'DELETE',
 headers: { 'x-pin-assertion': assertionToken },
 });
 const body = await res.json().catch(() => ({} as { error?: string }));
 setMutating(false);

 if (!res.ok) {
 if (res.status === 401) {
 handleUnauthorized();
 return;
 }
 clearCachedAssertion('delete_secret');
 showToast(body.error ?? t('vaultDetail.deleteFailed'), 'error');
 return;
 }

 showToast(t('vaultDetail.deletedToast'), 'success');
 const targetPage = items.length <= 1 && page > 1 ? page - 1 : page;
 if (targetPage !== page) {
 setPage(targetPage);
 } else {
 void loadItems(targetPage);
 }
 },
 [clearCachedAssertion, handleUnauthorized, items.length, loadItems, page, showToast, t],
 );

 const performUpdate = useCallback(
 async (target: PendingEdit, assertionToken: string) => {
 setMutating(true);
 const res = await fetch('/api/vault/' + target.id, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json', 'x-pin-assertion': assertionToken },
 body: JSON.stringify(target.payload),
 });
 const body = await res.json().catch(() => ({} as { error?: string }));
 setMutating(false);

 if (!res.ok) {
 if (res.status === 401) {
 handleUnauthorized();
 return;
 }
 clearCachedAssertion('edit_secret');
 showToast(body.error ?? t('vaultDetail.updateFailed'), 'error');
 return;
 }

 const now = toDisplayTime();
 setItems((prev) =>
 prev.map((item) =>
 item.id === target.id
 ? {
 ...item,
 title: target.payload.title,
 username: target.payload.username,
 category: target.payload.category || item.category,
 url: target.payload.url || '',
 updatedAt: now,
 }
 : item,
 ),
 );

 showToast(t('vaultDetail.updatedToast'), 'success');
 },
 [clearCachedAssertion, handleUnauthorized, showToast, t, toDisplayTime],
 );

 const unshareItemFromTeams = useCallback(
 async (itemId: string) => {
 if (mutating) return;
 const ok = window.confirm(locale === 'th' ? 'ต้องการยกเลิกแชร์รายการนี้ออกจากทุกห้องทีมใช่หรือไม่' : 'Cancel sharing this item from all team rooms?');
 if (!ok) return;

 setMutating(true);
 const res = await fetch('/api/vault/' + encodeURIComponent(itemId) + '/team-shares', {
 method: 'DELETE',
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string; removedCount?: number };
 setMutating(false);

 if (!res.ok) {
 if (res.status === 401) {
 handleUnauthorized();
 return;
 }
 showToast(body.error ?? (locale === 'th' ? 'ยกเลิกแชร์ไม่สำเร็จ' : 'Failed to cancel sharing'), 'error');
 return;
 }

 const removedCount = Number(body.removedCount ?? 0);
 showToast(
 locale === 'th'
 ? 'ยกเลิกแชร์แล้ว ' + removedCount + ' รายการ'
 : 'Removed team shares: ' + removedCount,
 'success',
 );
 void loadItems(page);
 },
 [handleUnauthorized, loadItems, locale, mutating, page, showToast],
 );

 const pageNumbers = useMemo(() => buildPageNumbers(page, totalPages), [page, totalPages]);

 return (
 <section className='space-y-4 pb-24 pt-2'>
 <header className='space-y-1'>
 <h1 className='text-3xl font-semibold leading-tight text-slate-900'>{t('vault.title')}</h1>
 <p className='text-sm leading-6 text-slate-500'>{t('vault.subtitle')}</p>
 </header>

 <div className='relative'>
 <Search className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder={t('vault.searchPlaceholder')}
 className='h-11 rounded-[14px] pl-11 text-[15px]'
 />
 </div>

 <div className='grid gap-2.5'>
 {items.map((item) => (
 <VaultCard
 key={item.id}
 id={item.id}
 title={item.title}
 username={item.username}
 updatedAt={item.updatedAt}
 category={item.category}
 sharedToTeamCount={item.sharedToTeamCount}
 onOpen={(id) => router.push('/vault/' + encodeURIComponent(id))}
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
 onShare={(id) => {
 const found = items.find((it) => it.id === id);
 if (found) setSharingItem(found);
 }}
 onUnshare={(id) => {
 void unshareItemFromTeams(id);
 }}
 />
 ))}
 </div>

 {loadingPage && items.length === 0 ? <p className='text-center text-sm text-slate-500'>{t('common.loading')}</p> : null}
 {!loadingPage && items.length === 0 ? <p className='text-center text-sm text-slate-500'>{locale === 'th' ? 'ยังไม่มีรายการในคลังรหัส' : 'No vault items yet'}</p> : null}

 {items.length > 0 ? (
 <div className='space-y-2 pt-1'>
 <p className='text-center text-xs text-slate-500'>
 {locale === 'th'
 ? `หน้า ${page}/${totalPages} • ทั้งหมด ${totalItems} รายการ`
 : `Page ${page}/${totalPages} • ${totalItems} total items`}
 </p>
 <div className='flex items-center justify-center gap-1.5'>
 <Button
 type='button'
 variant='secondary'
 className='h-9 rounded-xl px-3 text-xs'
 onClick={() => setPage((v) => Math.max(1, v - 1))}
 disabled={page <= 1 || loadingPage}
 >
 <ChevronLeft className='mr-1 h-3.5 w-3.5' />
 {locale === 'th' ? 'ก่อนหน้า' : 'Prev'}
 </Button>

 {pageNumbers[0] > 1 ? (
 <>
 <Button type='button' variant='secondary' className='h-9 min-w-[2.2rem] rounded-xl px-0 text-xs' onClick={() => setPage(1)} disabled={loadingPage}>1</Button>
 <span className='px-1 text-xs text-slate-400'>...</span>
 </>
 ) : null}

 {pageNumbers.map((num) => (
 <Button
 key={num}
 type='button'
 variant={num === page ? 'default' : 'secondary'}
 className='h-9 min-w-[2.2rem] rounded-xl px-0 text-xs'
 onClick={() => setPage(num)}
 disabled={loadingPage}
 >
 {num}
 </Button>
 ))}

 {pageNumbers[pageNumbers.length - 1] < totalPages ? (
 <>
 <span className='px-1 text-xs text-slate-400'>...</span>
 <Button type='button' variant='secondary' className='h-9 min-w-[2.2rem] rounded-xl px-0 text-xs' onClick={() => setPage(totalPages)} disabled={loadingPage}>{totalPages}</Button>
 </>
 ) : null}

 <Button
 type='button'
 variant='secondary'
 className='h-9 rounded-xl px-3 text-xs'
 onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
 disabled={page >= totalPages || loadingPage}
 >
 {locale === 'th' ? 'ถัดไป' : 'Next'}
 <ChevronRight className='ml-1 h-3.5 w-3.5' />
 </Button>
 </div>
 </div>
 ) : null}

 <AddVaultItemSheet
 onCreated={() => {
 setPage(1);
 void loadItems(1);
 }}
 />

 {editingItem ? (
 <VaultItemModal
 mode='edit'
 initialValue={{
 title: editingItem.title,
 username: editingItem.username,
 url: editingItem.url ?? '',
 category: editingItem.category,
 }}
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
 actionLabel={t('vaultDetail.actionDelete')}
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
 actionLabel={t('vaultDetail.actionEdit')}
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

 {sharingItem ? (
 <ShareToTeamModal
 open={Boolean(sharingItem)}
 itemId={sharingItem.id}
 itemTitle={sharingItem.title}
 onClose={() => setSharingItem(null)}
 onShared={() => {
 void loadItems(page);
 }}
 />
 ) : null}
 </section>
 );
}
