'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { VaultCard } from '@/components/vault/vault-card';
import { AddVaultItemSheet } from '@/components/vault/add-item-sheet';
import { PinModal } from '@/components/vault/pin-modal';
import { VaultItemModal } from '@/components/vault/vault-item-modal';
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
 url?: string;
};

type VaultApiItem = {
 id: string;
 title: string;
 username?: string;
 updated_at?: string;
 category?: string | null;
 url?: string | null;
};

type VaultApiResponse = {
 error?: string;
 items?: VaultApiItem[];
 pagination?: {
 hasMore?: boolean;
 nextCursor?: string | null;
 };
};

type VaultCachePayload = {
 items: VaultItem[];
 nextCursor: string | null;
 hasMore: boolean;
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

const PAGE_SIZE = 50;
const CACHE_KEY = 'vault_items_cache_v3';
const ASSERTION_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 12_000;

function mergeUniqueById(base: VaultItem[], incoming: VaultItem[]) {
 const map = new Map<string, VaultItem>();
 for (const item of base) map.set(item.id, item);
 for (const item of incoming) map.set(item.id, item);
 return Array.from(map.values());
}

export default function VaultPage() {
 const router = useRouter();
 const { t, locale } = useI18n();
 const { showToast } = useToast();

 const [items, setItems] = useState<VaultItem[]>([]);
 const [search, setSearch] = useState('');
 const [nextCursor, setNextCursor] = useState<string | null>(null);
 const [hasMore, setHasMore] = useState(false);
 const [loadingMore, setLoadingMore] = useState(false);
 const [initialLoading, setInitialLoading] = useState(false);

 const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
 const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
 const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
 const [mutating, setMutating] = useState(false);

 const deferredSearch = useDeferredValue(search);
 const loadMoreAnchorRef = useRef<HTMLDivElement | null>(null);
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

 const saveCache = useCallback((nextItems: VaultItem[], cursor: string | null, more: boolean) => {
 const payload: VaultCachePayload = { items: nextItems, nextCursor: cursor, hasMore: more };
 sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
 }, []);

 const mapApiItems = useCallback(
 (source: VaultApiItem[]) =>
 source.map((item) => ({
 id: item.id,
 title: item.title,
 username: item.username ?? '',
 updatedAt: toDisplayTime(item.updated_at),
 category: item.category ?? t('vault.categoryGeneral'),
 url: item.url ?? undefined,
 })),
 [t, toDisplayTime],
 );

 const hydrateCache = useCallback(() => {
 const cached = sessionStorage.getItem(CACHE_KEY);
 if (!cached) return false;
 try {
 const parsed = JSON.parse(cached) as VaultItem[] | VaultCachePayload;
 if (Array.isArray(parsed)) {
 if (parsed.length === 0) return false;
 setItems(parsed);
 return true;
 }
 if (!parsed || !Array.isArray(parsed.items)) return false;
 setItems(parsed.items);
 setNextCursor(typeof parsed.nextCursor === 'string' ? parsed.nextCursor : null);
 setHasMore(Boolean(parsed.hasMore && parsed.nextCursor));
 return parsed.items.length > 0;
 } catch {
 return false;
 }
 }, []);

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
 async ({ cursor = null, append = false, silent = false }: { cursor?: string | null; append?: boolean; silent?: boolean } = {}) => {
 if (requestLockRef.current) return;
 requestLockRef.current = true;
 if (append) setLoadingMore(true);
 else if (!silent) setInitialLoading(true);

 try {
 const params = new URLSearchParams();
 params.set('limit', String(PAGE_SIZE));
 if (cursor) params.set('cursor', cursor);

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
 const newCursor = body.pagination?.nextCursor ?? null;
 const newHasMore = Boolean(body.pagination?.hasMore && newCursor);
 setNextCursor(newCursor);
 setHasMore(newHasMore);

 setItems((prev) => {
 const next = append ? mergeUniqueById(prev, mapped) : mapped;
 saveCache(next, newCursor, newHasMore);
 return next;
 });
 } catch (error) {
 if ((error as Error).name === 'AbortError') {
 showToast(locale === 'th' ? 'โหลดข้อมูลช้าเกินไป กรุณาลองอีกครั้ง' : 'Loading timed out. Please retry.', 'error');
 } else {
 showToast(t('vaultDetail.loadFailed'), 'error');
 }
 } finally {
 requestLockRef.current = false;
 setLoadingMore(false);
 setInitialLoading(false);
 }
 },
 [handleUnauthorized, locale, mapApiItems, saveCache, showToast, t],
 );

 useEffect(() => {
 const hadCache = hydrateCache();
 void loadItems({ append: false, silent: hadCache });
 }, [hydrateCache, loadItems]);

 const loadNextPage = useCallback(() => {
 if (!hasMore || !nextCursor || loadingMore || initialLoading || mutating) return;
 void loadItems({ cursor: nextCursor, append: true, silent: true });
 }, [hasMore, initialLoading, loadItems, loadingMore, mutating, nextCursor]);

 useEffect(() => {
 if (!hasMore) return;
 if (typeof IntersectionObserver === 'undefined') return;
 const target = loadMoreAnchorRef.current;
 if (!target) return;

 const observer = new IntersectionObserver(
 (entries) => {
 if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
 },
 { rootMargin: '240px 0px' },
 );

 observer.observe(target);
 return () => observer.disconnect();
 }, [hasMore, loadNextPage]);

 const filtered = useMemo(() => {
 const q = deferredSearch.toLowerCase().trim();
 if (!q) return items;
 return items.filter((item) => item.title.toLowerCase().includes(q) || item.username.toLowerCase().includes(q));
 }, [deferredSearch, items]);

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

 setItems((prev) => {
 const next = prev.filter((item) => item.id !== targetId);
 saveCache(next, nextCursor, hasMore);
 return next;
 });
 showToast(t('vaultDetail.deletedToast'), 'success');
 },
 [clearCachedAssertion, handleUnauthorized, hasMore, nextCursor, saveCache, showToast, t],
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
 setItems((prev) => {
 const next = prev.map((item) =>
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
 );
 saveCache(next, nextCursor, hasMore);
 return next;
 });

 showToast(t('vaultDetail.updatedToast'), 'success');
 },
 [clearCachedAssertion, handleUnauthorized, hasMore, nextCursor, saveCache, showToast, t, toDisplayTime],
 );

 return (
 <section className='space-y-5 pb-24 pt-2'>
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
 className='h-12 rounded-[16px] pl-11 text-base'
 />
 </div>

 <div className='grid gap-3.5'>
 {filtered.map((item) => (
 <VaultCard
 key={item.id}
 id={item.id}
 title={item.title}
 username={item.username}
 updatedAt={item.updatedAt}
 category={item.category}
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
 />
 ))}
 </div>

 {initialLoading && items.length === 0 ? <p className='text-center text-sm text-slate-500'>{t('common.loading')}</p> : null}
 {!initialLoading && filtered.length === 0 ? <p className='text-center text-sm text-slate-500'>{locale === 'th' ? 'ยังไม่มีรายการในคลังรหัส' : 'No vault items yet'}</p> : null}

 <div ref={loadMoreAnchorRef} className='h-1 w-full' />

 {hasMore ? (
 <Button
 type='button'
 variant='secondary'
 className='h-11 w-full rounded-[16px]'
 onClick={loadNextPage}
 disabled={loadingMore || mutating}
 >
 {loadingMore ? t('common.loading') : (locale === 'th' ? 'โหลดเพิ่มเติม' : 'Load more')}
 </Button>
 ) : filtered.length > 0 ? (
 <p className='text-center text-xs text-slate-400'>{locale === 'th' ? 'แสดงครบทั้งหมดแล้ว' : 'You have reached the end'}</p>
 ) : null}

 <AddVaultItemSheet
 onCreated={(item) => {
 setItems((prev) => {
 const next = [item, ...prev];
 saveCache(next, nextCursor, hasMore);
 return next;
 });
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
 </section>
 );
}
