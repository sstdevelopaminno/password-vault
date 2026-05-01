'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';
import type { PinAction } from '@/lib/pin';

const ACTION_ORDER: PinAction[] = [
  'open_workspace_folder',
  'view_secret',
  'copy_secret',
  'edit_secret',
  'delete_secret',
  'delete_workspace_folder',
  'delete_account',
  'admin_view_vault',
  'approve_signup_request',
  'delete_signup_request',
];

type PinPolicy = Record<PinAction, boolean>;

function actionLabel(action: PinAction, isThai: boolean) {
  switch (action) {
    case 'open_workspace_folder':
      return isThai ? 'เปิดโฟลเดอร์คลาวด์ไฟล์งาน' : 'Open cloud folder';
    case 'view_secret':
      return isThai ? 'ดูรหัส/ข้อมูลสำคัญ' : 'View secret data';
    case 'copy_secret':
      return isThai ? 'คัดลอกรหัส/ข้อมูลสำคัญ' : 'Copy secret data';
    case 'edit_secret':
      return isThai ? 'แก้ไขรหัส/ข้อมูลสำคัญ' : 'Edit secret data';
    case 'delete_secret':
      return isThai ? 'ลบรหัส/ข้อมูลสำคัญ' : 'Delete secret data';
    case 'delete_workspace_folder':
      return isThai ? 'ลบโฟลเดอร์คลาวด์ไฟล์งาน' : 'Delete cloud folder';
    case 'delete_account':
      return isThai ? 'ลบบัญชีผู้ใช้' : 'Delete account';
    case 'admin_view_vault':
      return isThai ? 'แอดมินดู Vault ผู้ใช้อื่น' : 'Admin view user vault';
    case 'approve_signup_request':
      return isThai ? 'อนุมัติคำขอสมัคร' : 'Approve signup request';
    case 'delete_signup_request':
      return isThai ? 'ลบ/ปฏิเสธคำขอสมัคร' : 'Reject signup request';
    case 'unlock_app':
      return isThai ? 'ปลดล็อกแอป' : 'Unlock app';
    default:
      return action;
  }
}

export default function PinSecuritySettingsPage() {
  const { locale } = useI18n();
  const { showToast } = useToast();
  const router = useRouter();
  const isThai = locale === 'th';

  const [policy, setPolicy] = useState<PinPolicy | null>(null);
  const [editableActions, setEditableActions] = useState<PinAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAction, setSavingAction] = useState<PinAction | ''>('');

  const availableActions = useMemo(() => {
    const editableSet = new Set(editableActions);
    return ACTION_ORDER.filter((action) => editableSet.has(action));
  }, [editableActions]);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/pin/preferences', { cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        policy?: PinPolicy;
        editableActions?: PinAction[];
      };
      if (!response.ok || !body.policy) {
        showToast(body.error || (isThai ? 'โหลดการตั้งค่า PIN ไม่สำเร็จ' : 'Failed to load PIN settings'), 'error');
        return;
      }
      setPolicy(body.policy);
      setEditableActions(Array.isArray(body.editableActions) ? body.editableActions : []);
    } catch {
      showToast(isThai ? 'โหลดการตั้งค่า PIN ไม่สำเร็จ' : 'Failed to load PIN settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [isThai, showToast]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  const toggleAction = useCallback(
    async (action: PinAction) => {
      if (!policy || savingAction) return;
      const nextValue = !policy[action];

      setSavingAction(action);
      setPolicy((prev) => (prev ? { ...prev, [action]: nextValue } : prev));

      try {
        const response = await fetch('/api/pin/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ policy: { [action]: nextValue } }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string; policy?: PinPolicy };
        if (!response.ok || !body.policy) {
          setPolicy((prev) => (prev ? { ...prev, [action]: !nextValue } : prev));
          showToast(body.error || (isThai ? 'บันทึกการตั้งค่าไม่สำเร็จ' : 'Failed to save setting'), 'error');
          return;
        }

        setPolicy(body.policy);
      } catch {
        setPolicy((prev) => (prev ? { ...prev, [action]: !nextValue } : prev));
        showToast(isThai ? 'บันทึกการตั้งค่าไม่สำเร็จ' : 'Failed to save setting', 'error');
      } finally {
        setSavingAction('');
      }
    },
    [isThai, policy, savingAction, showToast],
  );

  return (
    <section className='space-y-3 pb-24 pt-[calc(env(safe-area-inset-top)+0.5rem)] animate-screen-in'>
      <div className='flex items-center gap-2'>
        <button
          type='button'
          className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-200'
          onClick={() => router.push('/settings?section=pin')}
          aria-label={isThai ? 'ย้อนกลับ' : 'Back'}
        >
          <ChevronLeft className='h-4 w-4' />
        </button>
        <div>
          <h1 className='text-app-h2 font-semibold text-slate-100'>{isThai ? 'ตั้งค่า PIN รายเมนู' : 'PIN By Menu'}</h1>
          <p className='text-app-caption text-slate-300'>{isThai ? 'เปิด/ปิดการยืนยัน PIN รายเมนู' : 'Enable or disable PIN confirmation per action.'}</p>
        </div>
      </div>

      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <p className='text-app-body font-semibold text-slate-100'>{isThai ? 'รายการการยืนยัน PIN' : 'PIN confirmation list'}</p>
          <Button type='button' variant='secondary' size='sm' className='h-8 rounded-xl px-3' onClick={() => void loadPolicy()} disabled={loading}>
            {loading ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : isThai ? 'รีเฟรช' : 'Refresh'}
          </Button>
        </div>

        {loading && !policy ? (
          <div className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-3 text-app-caption text-slate-300'>
            {isThai ? 'กำลังโหลดการตั้งค่า...' : 'Loading settings...'}
          </div>
        ) : null}

        {!loading && policy && availableActions.length === 0 ? (
          <div className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-3 text-app-caption text-slate-300'>
            {isThai ? 'ไม่พบรายการที่ตั้งค่าได้' : 'No configurable actions found.'}
          </div>
        ) : null}

        {policy ? (
          <div className='space-y-2'>
            {availableActions.map((action) => {
              const enabled = policy[action] !== false;
              const saving = savingAction === action;
              return (
                <div key={action} className='flex items-center justify-between gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] px-3 py-2.5'>
                  <div className='min-w-0'>
                    <p className='truncate text-app-body font-semibold text-slate-100'>{actionLabel(action, isThai)}</p>
                    <p className='text-[11px] text-slate-300'>
                      {enabled ? (isThai ? 'ต้องยืนยัน PIN' : 'PIN required') : isThai ? 'ไม่ต้องยืนยัน PIN' : 'No PIN required'}
                    </p>
                  </div>
                  <button
                    type='button'
                    onClick={() => void toggleAction(action)}
                    disabled={savingAction !== ''}
                    className={
                      'inline-flex min-w-[108px] items-center justify-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition ' +
                      (enabled ? 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100' : 'border-rose-300/60 bg-rose-500/16 text-rose-100')
                    }
                  >
                    {saving ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : enabled ? <ShieldCheck className='h-3.5 w-3.5' /> : <ShieldOff className='h-3.5 w-3.5' />}
                    {enabled ? (isThai ? 'เปิด' : 'On') : isThai ? 'ปิด' : 'Off'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
