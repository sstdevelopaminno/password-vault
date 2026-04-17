'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

type AuditLog = {
 id: string;
 action_type: string;
 created_at: string;
 actor_user_id: string | null;
 target_user_id: string | null;
 target_vault_item_id: string | null;
 metadata_json: Record<string, unknown> | null;
};

type ApiBody = {
 error?: string;
 logs?: AuditLog[];
 pagination?: { limit: number; hasMore: boolean; nextCursor: string | null };
};

const PAGE_SIZE = 100;

export default function AuditLogsPage() {
 const { showToast } = useToast();
 const [logs, setLogs] = useState<AuditLog[]>([]);
 const [q, setQ] = useState('');
 const [action, setAction] = useState('');
 const [from, setFrom] = useState('');
 const [to, setTo] = useState('');
 const [loading, setLoading] = useState(false);
 const [loadingMore, setLoadingMore] = useState(false);
 const [nextCursor, setNextCursor] = useState<string | null>(null);
 const [hasMore, setHasMore] = useState(false);

 const queryString = useMemo(() => {
 const params = new URLSearchParams();
 if (q.trim()) params.set('q', q.trim());
 if (action.trim()) params.set('action', action.trim());
 if (from) params.set('from', from);
 if (to) params.set('to', to);
 return params.toString();
 }, [q, action, from, to]);

 async function load(reset: boolean) {
 if (reset) setLoading(true);
 else setLoadingMore(true);

 const params = new URLSearchParams(queryString);
 params.set('limit', String(PAGE_SIZE));
 if (!reset && nextCursor) params.set('cursor', nextCursor);

 const res = await fetch('/api/admin/audit-logs?' + params.toString(), { cache: 'no-store' });
 const body = (await res.json().catch(() => ({}))) as ApiBody;
 if (reset) setLoading(false);
 else setLoadingMore(false);

 if (!res.ok) {
 showToast(String(body.error ?? 'Failed to load audit logs'), 'error');
 return;
 }

 const page = Array.isArray(body.logs) ? body.logs : [];
 setNextCursor(body.pagination?.nextCursor ?? null);
 setHasMore(Boolean(body.pagination?.hasMore));

 if (reset) {
 setLogs(page);
 } else {
 setLogs((prev) => {
 const known = new Set(prev.map((item) => item.id));
 return prev.concat(page.filter((item) => !known.has(item.id)));
 });
 }
 }

 useEffect(() => {
 const timer = window.setTimeout(() => {
 void load(true);
 }, 0);
 return () => window.clearTimeout(timer);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 function exportCsv() {
 const params = new URLSearchParams(queryString);
 params.set('format', 'csv');
 params.set('limit', '5000');
 const href = '/api/admin/audit-logs?' + params.toString();
 window.location.href = href;
 }

 return (
 <section className='space-y-3 pb-20'>
 <h1 className='text-xl font-semibold'>Audit Logs</h1>

 <Card className='space-y-3'>
 <div className='grid gap-2 sm:grid-cols-2'>
 <Input placeholder='Search action' value={q} onChange={(e) => setQ(e.target.value)} />
 <Input placeholder='Filter action exact (e.g. pin_verified)' value={action} onChange={(e) => setAction(e.target.value)} />
 </div>
 <div className='grid gap-2 sm:grid-cols-2'>
 <Input type='date' value={from} onChange={(e) => setFrom(e.target.value)} />
 <Input type='date' value={to} onChange={(e) => setTo(e.target.value)} />
 </div>
 <div className='grid grid-cols-2 gap-2'>
 <Button variant='secondary' onClick={() => void load(true)} disabled={loading}>{loading ? 'Loading...' : 'Apply filters'}</Button>
 <Button onClick={exportCsv}>Export CSV</Button>
 </div>
 </Card>

 {logs.map((log) => (
 <Card key={log.id} className='space-y-1'>
 <p className='text-sm font-medium'>{log.action_type}</p>
 <p className='text-xs text-slate-500'>{new Date(log.created_at).toLocaleString()}</p>
 <p className='text-xs text-slate-500'>actor: {log.actor_user_id ?? '-'}</p>
 <p className='text-xs text-slate-500'>target user: {log.target_user_id ?? '-'}</p>
 </Card>
 ))}

 {hasMore ? (
 <Button variant='secondary' className='h-11 w-full rounded-[14px]' onClick={() => void load(false)} disabled={loadingMore || loading}>
 {loadingMore ? 'Loading...' : 'Load more logs'}
 </Button>
 ) : null}

 {logs.length === 0 && !loading ? <Card>No audit logs yet.</Card> : null}
 </section>
 );
}

