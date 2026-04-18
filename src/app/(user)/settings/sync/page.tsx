'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, DatabaseZap, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';
import { setOfflineEncryptionPassphrase } from '@/lib/offline-store';
import {
  flushOfflineQueue,
  getOfflineQueueItems,
  getOfflineQueueSummary,
  purgeOfflineQueue,
  runOfflineRecoverySelfTest,
} from '@/lib/offline-sync';
import { useOutageState } from '@/lib/outage-detector';

type QueueItem = Awaited<ReturnType<typeof getOfflineQueueItems>>[number];
type QueueSummary = Awaited<ReturnType<typeof getOfflineQueueSummary>>;
type QueueFilter = 'all' | 'vault' | 'notes' | 'system';

export default function SyncCenterPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const { showToast } = useToast();
  const { online, apiReachable, isOfflineMode, lastCheckedAt, autoSync } = useOutageState();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState<QueueSummary>({ total: 0, unlocked: 0, locked: 0 });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [runningSelfTest, setRunningSelfTest] = useState(false);
  const [pin, setPin] = useState('');
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<QueueFilter>('all');

  const isThai = locale === 'th';

  const statusLabel = useMemo(() => {
    if (!online) return isThai ? 'อุปกรณ์ออฟไลน์' : 'Device offline';
    if (!apiReachable) return isThai ? 'เซิร์ฟเวอร์/ฐานข้อมูลไม่พร้อม' : 'Server/DB unavailable';
    if (autoSync.syncing) return isThai ? 'กำลังกู้คืนและซิงก์อัตโนมัติ' : 'Recovering with auto-sync';
    return isThai ? 'พร้อมซิงก์' : 'Ready to sync';
  }, [apiReachable, autoSync.syncing, isThai, online]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => (item.meta?.feature ?? 'system') === filter);
  }, [filter, items]);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const [queue, stats] = await Promise.all([getOfflineQueueItems(), getOfflineQueueSummary()]);
      setItems(queue);
      setSummary(stats);
    } catch {
      setItems([]);
      setSummary({ total: 0, unlocked: 0, locked: 0 });
      showToast(isThai ? "โหลดคิวออฟไลน์ไม่สำเร็จ" : "Failed to load offline queue", "error");
    } finally {
      setLoading(false);
    }
  }, [isThai, showToast]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function runSync() {
    if (summary.locked > 0 && summary.unlocked === 0) {
      showToast(
        isThai ? "คิวถูกล็อกทั้งหมด กรุณาใส่ PIN เพื่อปลดล็อกก่อนซิงก์" : "All queued items are locked. Enter PIN to unlock before syncing.",
        "error",
      );
      return;
    }

    setSyncing(true);
    try {
      const result = await flushOfflineQueue();
      setFailedIds(result.failedIds);
      await loadQueue();

      if (result.processed === 0 && result.failed === 0 && summary.locked > 0) {
        showToast(
          isThai
            ? "ไม่พบรายการที่ปลดล็อกได้ในคิว กรุณาใส่ PIN แล้วลองใหม่"
            : "No unlockable queue items found. Enter PIN and retry.",
          "error",
        );
        return;
      }

      showToast(
        isThai
          ? `ซิงก์สำเร็จ ${result.processed} รายการ, ค้าง ${result.failed} รายการ`
          : `Synced ${result.processed} item(s), ${result.failed} failed`,
        result.failed > 0 ? 'error' : 'success',
      );
    } catch {
      showToast(isThai ? "ซิงก์คิวไม่สำเร็จ" : "Unable to sync queue", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function runRetryFailedOnly() {
    if (failedIds.length === 0) return;
    setSyncing(true);
    try {
      const result = await flushOfflineQueue({ onlyIds: failedIds });
      setFailedIds(result.failedIds);
      await loadQueue();
      showToast(
        isThai
          ? `ลองซ้ำสำเร็จ ${result.processed} รายการ, ค้าง ${result.failed} รายการ`
          : `Retry synced ${result.processed} item(s), ${result.failed} still failed`,
        result.failed > 0 ? 'error' : 'success',
      );
    } catch {
      showToast(isThai ? "ลองซ้ำไม่สำเร็จ" : "Retry failed", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function clearQueue() {
    if (!window.confirm(isThai ? 'ล้างคิวออฟไลน์ทั้งหมด?' : 'Clear all offline queue items?')) return;
    await purgeOfflineQueue();
    setFailedIds([]);
    await loadQueue();
    showToast(isThai ? 'ล้างคิวแล้ว' : 'Queue cleared', 'success');
  }

  async function unlockQueueWithPin() {
    const sanitized = pin.replace(/\D/g, '').slice(0, 6);
    if (sanitized.length !== 6) {
      showToast(isThai ? 'กรุณากรอก PIN 6 หลัก' : 'Please enter a 6-digit PIN', 'error');
      return;
    }
    const before = await getOfflineQueueSummary();
    setOfflineEncryptionPassphrase(sanitized);
    const [queue, after] = await Promise.all([getOfflineQueueItems(), getOfflineQueueSummary()]);
    setItems(queue);
    setSummary(after);

    if (before.locked > 0 && after.locked < before.locked) {
      showToast(isThai ? 'ปลดล็อกคิวแล้ว ลองซิงก์อีกครั้ง' : 'Queue unlocked. Try syncing again.', 'success');
      return;
    }

    if (after.locked === 0) {
      showToast(isThai ? 'ปลดล็อกคิวเรียบร้อย' : 'Queue unlocked.', 'success');
      return;
    }

    showToast(
      isThai
        ? 'PIN ไม่ตรงกับคิวที่เข้ารหัสไว้ หรือยังมีรายการที่ยังปลดล็อกไม่ได้'
        : 'PIN did not match the encrypted queue, or some records are still locked.',
      'error',
    );
  }

  async function runRecoverySelfTest() {
    setRunningSelfTest(true);
    try {
      const result = await runOfflineRecoverySelfTest();
      await loadQueue();
      showToast(
        result.passed
          ? isThai
            ? 'Self-test ผ่าน: คิวออฟไลน์กู้คืนและซิงก์ได้'
            : 'Self-test passed: offline queue recovered and synced'
          : isThai
            ? 'Self-test ไม่ผ่าน: ตรวจสอบเครือข่าย/เซิร์ฟเวอร์'
            : 'Self-test failed: check network/server health',
        result.passed ? 'success' : 'error',
      );
    } catch {
      showToast(isThai ? 'Self-test ล้มเหลว' : 'Self-test failed', 'error');
    } finally {
      setRunningSelfTest(false);
    }
  }

  return (
    <section className='space-y-4 pb-24 pt-2'>
      <div className='flex items-center gap-2'>
        <Button type='button' variant='secondary' className='h-9 w-9 rounded-xl p-0' onClick={() => router.push('/settings')}>
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <h1 className='text-2xl font-semibold text-slate-900'>{isThai ? 'ศูนย์ซิงก์' : 'Sync Center'}</h1>
      </div>

      <Card className='space-y-2 rounded-[20px] p-4'>
        <p className='text-sm font-semibold text-slate-800'>{isThai ? 'สถานะระบบ' : 'System status'}</p>
        <p className='text-sm text-slate-600'>{statusLabel}</p>
        <p className='text-xs text-slate-500'>
          {isThai ? 'อัปเดตล่าสุด:' : 'Last checked:'} {lastCheckedAt ? new Date(lastCheckedAt).toLocaleString(isThai ? 'th-TH' : 'en-US') : '-'}
        </p>
        {autoSync.lastSyncedAt ? (
          <p className='text-xs text-slate-500'>
            {isThai ? 'Auto-sync ล่าสุด:' : 'Last auto-sync:'}{' '}
            {new Date(autoSync.lastSyncedAt).toLocaleString(isThai ? 'th-TH' : 'en-US')} ·
            {' '}
            {isThai ? `สำเร็จ ${autoSync.processed ?? 0} / ล้มเหลว ${autoSync.failed ?? 0}` : `Processed ${autoSync.processed ?? 0} / Failed ${autoSync.failed ?? 0}`}
          </p>
        ) : null}
        <div className='grid grid-cols-2 gap-2 pt-2'>
          <Button type='button' className='h-10 rounded-xl' onClick={() => void runSync()} disabled={syncing || summary.total === 0}>
            <RefreshCw className={'mr-2 h-4 w-4 ' + (syncing ? 'animate-spin' : '')} />
            {isThai ? 'ซิงก์ตอนนี้' : 'Sync now'}
          </Button>
          <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={() => void runRetryFailedOnly()} disabled={syncing || failedIds.length === 0}>
            {isThai ? 'ลองซ้ำเฉพาะที่ล้มเหลว' : 'Retry failed only'}
          </Button>
        </div>
        <div className='grid grid-cols-1 pt-2'>
          <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={() => void clearQueue()} disabled={summary.total === 0}>
            <Trash2 className='mr-2 h-4 w-4' />
            {isThai ? 'ล้างคิว' : 'Clear queue'}
          </Button>
        </div>
        <div className='grid grid-cols-1 pt-2'>
          <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={() => void runRecoverySelfTest()} disabled={runningSelfTest || syncing}>
            <RefreshCw className={'mr-2 h-4 w-4 ' + (runningSelfTest ? 'animate-spin' : '')} />
            {isThai ? 'รัน Self-Test กู้คืนออฟไลน์' : 'Run offline recovery self-test'}
          </Button>
        </div>
      </Card>

      <Card className='space-y-2 rounded-[20px] p-4'>
        <p className='text-sm font-semibold text-slate-800'>
          {isThai ? `คิวรอซิงก์ (${summary.total})` : `Pending queue (${summary.total})`}
        </p>
        <p className='text-xs text-slate-500'>
          {isThai ? `ปลดล็อกได้ ${summary.unlocked} / ล็อกอยู่ ${summary.locked}` : `Unlocked ${summary.unlocked} / Locked ${summary.locked}`}
        </p>

        {summary.locked > 0 ? (
          <div className='space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3'>
            <p className='text-xs font-semibold text-amber-800'>
              {isThai
                ? 'มีรายการที่ล็อกอยู่จาก session เก่า ใส่ PIN เพื่อปลดล็อก'
                : 'Some queued items are locked from a previous session. Enter PIN to unlock.'}
            </p>
            <div className='grid grid-cols-[1fr_auto] gap-2'>
              <Input
                type='password'
                inputMode='numeric'
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={isThai ? 'PIN 6 หลัก' : '6-digit PIN'}
              />
              <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={() => void unlockQueueWithPin()}>
                {isThai ? 'ปลดล็อก' : 'Unlock'}
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? <p className='text-sm text-slate-500'>{isThai ? 'กำลังโหลด...' : 'Loading...'}</p> : null}
        {!loading && summary.total === 0 ? (
          <p className='text-sm text-slate-500'>{isThai ? 'ไม่มีรายการค้างซิงก์' : 'No pending items'}</p>
        ) : null}

        <div className='grid grid-cols-4 gap-2 py-1'>
          <Button type='button' variant={filter === 'all' ? 'default' : 'secondary'} className='h-8 rounded-lg px-2 text-[11px]' onClick={() => setFilter('all')}>
            {isThai ? 'ทั้งหมด' : 'All'}
          </Button>
          <Button type='button' variant={filter === 'vault' ? 'default' : 'secondary'} className='h-8 rounded-lg px-2 text-[11px]' onClick={() => setFilter('vault')}>
            Vault
          </Button>
          <Button type='button' variant={filter === 'notes' ? 'default' : 'secondary'} className='h-8 rounded-lg px-2 text-[11px]' onClick={() => setFilter('notes')}>
            Notes
          </Button>
          <Button type='button' variant={filter === 'system' ? 'default' : 'secondary'} className='h-8 rounded-lg px-2 text-[11px]' onClick={() => setFilter('system')}>
            {isThai ? 'ระบบ' : 'System'}
          </Button>
        </div>

        <div className='space-y-2'>
          {filteredItems.map((item) => (
            <div key={item.id} className='rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700'>
              <p className='font-semibold'>
                {(item.meta?.label ?? item.method + ' ' + item.url) + (item.meta?.pinReverify ? ' • PIN' : '')}
              </p>
              <p className='mt-1 text-[11px] text-slate-500'>{(item.meta?.feature ?? 'system').toUpperCase()}</p>
              <p className='mt-1 text-slate-500'>{new Date(item.createdAt).toLocaleString(isThai ? 'th-TH' : 'en-US')}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className='space-y-2 rounded-[20px] border-amber-200 bg-amber-50 p-4'>
        <p className='inline-flex items-center gap-2 text-sm font-semibold text-amber-800'>
          {isOfflineMode ? <WifiOff className='h-4 w-4' /> : <DatabaseZap className='h-4 w-4' />}
          {isThai ? 'เมื่อเน็ตหลุด/ฐานข้อมูลล่ม' : 'When network/DB is unavailable'}
        </p>
        <p className='text-xs leading-5 text-amber-900'>
          {isThai
            ? 'แอปจะทำงานจากข้อมูลในเครื่องและเก็บคำสั่งในคิว เมื่อระบบกลับมาจะซิงก์อัตโนมัติ หรือซิงก์เองจากหน้านี้'
            : 'The app continues with local data and queues writes. It auto-syncs when recovered, or you can sync here.'}
        </p>
      </Card>
    </section>
  );
}
