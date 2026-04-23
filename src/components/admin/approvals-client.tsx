'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Mail, RefreshCcw, Trash2, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PinModal } from '@/components/vault/pin-modal';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';

type ApprovalRequest = {
 id: string;
 user_id: string;
 created_at: string;
 profiles: { email: string; full_name: string } | null;
};

type PendingDecision = {
 userId: string;
 approved: boolean;
};

type ApiBody = {
 error?: string;
 requests?: ApprovalRequest[];
 pagination?: { limit: number; hasMore: boolean; nextCursor: string | null };
};

const PAGE_SIZE = 50;

function toLocalTime(raw: string, locale: 'th' | 'en') {
 const d = new Date(raw);
 if (Number.isNaN(d.getTime())) return '-';
 return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-US', {
 year: 'numeric',
 month: '2-digit',
 day: '2-digit',
 hour: '2-digit',
 minute: '2-digit',
 }).format(d);
}

function mapActionError(message: unknown, locale: 'th' | 'en') {
 const text = String(message ?? '');
 const lower = text.toLowerCase();
 if (lower.includes('pin')) return locale === 'th' ? 'กรุณายืนยัน PIN ก่อนทำรายการ' : 'Please verify PIN before this action.';
 if (lower.includes('forbidden') || lower.includes('unauthorized')) return locale === 'th' ? 'คุณไม่มีสิทธิ์ทำรายการนี้' : 'You are not allowed to perform this action.';
 if (lower.includes('timeout') || lower.includes('network')) return locale === 'th' ? 'เครือข่ายไม่เสถียร กรุณาลองใหม่' : 'Network timeout. Please retry.';
 return text || (locale === 'th' ? 'ทำรายการไม่สำเร็จ' : 'Action failed');
}

export function ApprovalsClient() {
 const { showToast } = useToast();
 const { locale } = useI18n();
 const [requests, setRequests] = useState<ApprovalRequest[]>([]);
 const [nextCursor, setNextCursor] = useState<string | null>(null);
 const [hasMore, setHasMore] = useState(false);
 const [processing, setProcessing] = useState<string | null>(null);
 const [refreshing, setRefreshing] = useState(false);
 const [loadingMore, setLoadingMore] = useState(false);
 const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);

 const text = useMemo(() => ({
 title: locale === 'th' ? 'คำขอสมัครใช้งาน' : 'Signup Requests',
 subtitle: locale === 'th' ? 'ตรวจสอบชื่อและอีเมลของผู้สมัครก่อนอนุมัติ' : 'Review full name and email before approval',
 empty: locale === 'th' ? 'ยังไม่มีคำขอที่รออนุมัติ' : 'No pending requests.',
 approve: locale === 'th' ? 'อนุมัติ' : 'Approve',
 remove: locale === 'th' ? 'ลบ' : 'Delete',
 refresh: locale === 'th' ? 'รีเฟรช' : 'Refresh',
 pinApprove: locale === 'th' ? 'อนุมัติคำขอนี้' : 'Approve this request',
 pinDelete: locale === 'th' ? 'ลบคำขอนี้' : 'Delete this request',
 approvedToast: locale === 'th' ? 'อนุมัติคำขอแล้ว' : 'Request approved',
 deletedToast: locale === 'th' ? 'ลบคำขอแล้ว' : 'Request deleted',
 unknownName: locale === 'th' ? 'ไม่ระบุชื่อ' : 'Unknown',
 requestedAt: locale === 'th' ? 'เวลาส่งคำขอ' : 'Requested at',
 nameLabel: locale === 'th' ? 'ชื่อผู้สมัคร' : 'Applicant',
 emailLabel: locale === 'th' ? 'อีเมล' : 'Email',
 fetching: locale === 'th' ? 'กำลังโหลดรายการ...' : 'Loading requests...',
 loadMore: locale === 'th' ? 'โหลดเพิ่ม' : 'Load more',
 }), [locale]);

 const loadRequests = useCallback(async (append: boolean, silent: boolean) => {
 if (append) {
 if (!hasMore || loadingMore) return;
 setLoadingMore(true);
 } else if (!silent) {
 setRefreshing(true);
 }

 try {
 const params = new URLSearchParams();
 params.set('limit', String(PAGE_SIZE));
 if (append && nextCursor) params.set('cursor', nextCursor);
 const res = await fetch('/api/admin/approvals?' + params.toString(), { method: 'GET', cache: 'no-store' });
 const body = (await res.json().catch(() => ({}))) as ApiBody;
 if (!res.ok) {
 if (!silent) showToast(mapActionError(body.error, locale), 'error');
 return;
 }

 const page = Array.isArray(body.requests) ? body.requests : [];
 setNextCursor(body.pagination?.nextCursor ?? null);
 setHasMore(Boolean(body.pagination?.hasMore));
 if (append) {
 setRequests((prev) => {
 const known = new Set(prev.map((item) => item.id));
 return prev.concat(page.filter((item) => !known.has(item.id)));
 });
 } else {
 setRequests(page);
 }
 } catch {
 if (!silent) showToast(locale === 'th' ? 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่' : 'Network error. Please retry.', 'error');
 } finally {
 if (append) setLoadingMore(false);
 else if (!silent) setRefreshing(false);
 }
 }, [hasMore, loadingMore, locale, nextCursor, showToast]);

 useEffect(() => {
 void loadRequests(false, false);
 }, [loadRequests]);

 useEffect(() => {
 const timer = window.setInterval(() => { void loadRequests(false, true); }, 12000);
 return () => window.clearInterval(timer);
 }, [loadRequests]);

 async function decide(userId: string, approved: boolean, assertionToken: string) {
 if (processing) return;
 setProcessing(userId);
 try {
 const res = await fetch('/api/admin/approvals', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'x-pin-assertion': assertionToken },
 body: JSON.stringify({ userId, approved }),
 });
 const body = (await res.json().catch(() => ({}))) as { error?: string };
 if (!res.ok) {
 showToast(mapActionError(body.error, locale), 'error');
 return;
 }
 setRequests((prev) => prev.filter((r) => r.user_id !== userId));
 showToast(approved ? text.approvedToast : text.deletedToast, 'success');
 } catch {
 showToast(locale === 'th' ? 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่' : 'Network error. Please retry.', 'error');
 } finally {
 setProcessing(null);
 }
 }

 return (

<section className='space-y-4 pb-24 pt-1'>
 <header className='space-y-1 px-1'>
 <h1 className='text-[38px] font-semibold leading-[1.05] tracking-[-0.02em] text-slate-900'>{text.title}</h1>
 <p className='text-[14px] leading-6 text-slate-500'>{text.subtitle}</p>
 </header>

 <div className='px-1'>
 <Button variant='secondary' className='h-11 w-full rounded-[14px] text-[14px] font-semibold' disabled={refreshing} onClick={() => void loadRequests(false, false)}>
 <RefreshCcw className={'mr-2 h-4 w-4' + (refreshing ? ' animate-spin' : '')} />
 {refreshing ? text.fetching : text.refresh}
 </Button>
 </div>

 {requests.length === 0 ? (
 <Card className='rounded-[22px] border border-slate-200 bg-white px-4 py-5 text-[17px] font-medium text-slate-700 shadow-[0_10px_26px_rgba(15,23,42,0.06)]'>
 {text.empty}
 </Card>
 ) : null}

 <div className='space-y-3'>
 {requests.map((r, index) => {
 const loading = processing === r.user_id;
 return (
 <Card key={r.id} className='animate-slide-up rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]' style={{ animationDelay: String(index * 30) + 'ms' }}>
 <div className='space-y-3'>
 <div className='rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-3'>
 <div className='flex items-center gap-2 text-[12px] font-semibold text-slate-500'>
 <UserRound className='h-3.5 w-3.5' />
 {text.nameLabel}
 </div>
 <p className='mt-1 text-[17px] font-semibold leading-6 text-slate-900'>{r.profiles?.full_name ?? text.unknownName}</p>

 <div className='mt-3 flex items-center gap-2 text-[12px] font-semibold text-slate-500'>
 <Mail className='h-3.5 w-3.5' />
 {text.emailLabel}
 </div>
 <p className='mt-1 break-all text-[15px] leading-6 text-slate-700'>{r.profiles?.email ?? '-'}</p>
 </div>

 <p className='text-[12px] text-slate-500'>{text.requestedAt}: {toLocalTime(r.created_at, locale)}</p>

 <div className='grid grid-cols-2 gap-2'>
 <Button disabled={loading} className='h-11 rounded-[14px] bg-gradient-to-r from-blue-600 to-indigo-500 text-[14px] font-semibold text-white' onClick={() => setPendingDecision({ userId: r.user_id, approved: true })}>
 <CheckCircle2 className='mr-2 h-4 w-4' />
 {text.approve}
 </Button>
 <Button disabled={loading} variant='destructive' className='h-11 rounded-[14px] text-[14px] font-semibold' onClick={() => setPendingDecision({ userId: r.user_id, approved: false })}>
 <Trash2 className='mr-2 h-4 w-4' />
 {text.remove}
 </Button>
 </div>
 </div>
 </Card>
 );
 })}
 </div>

 {hasMore ? (
 <Button variant='secondary' className='h-11 w-full rounded-[14px]' disabled={loadingMore || refreshing} onClick={() => void loadRequests(true, false)}>
 {loadingMore ? text.fetching : text.loadMore}
 </Button>
 ) : null}

 {pendingDecision ? (
 <PinModal
 action={pendingDecision.approved ? 'approve_signup_request' : 'delete_signup_request'}
 actionLabel={pendingDecision.approved ? text.pinApprove : text.pinDelete}
 targetItemId={pendingDecision.userId}
 onClose={() => setPendingDecision(null)}
 onVerified={async (token) => {
 const payload = pendingDecision;
 setPendingDecision(null);
 await decide(payload.userId, payload.approved, token);
 }}
 />
 ) : null}
</section>
 );
}

