'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ExternalLink, RefreshCw, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { executeMdmAction, readMdmOverview, type MdmComplianceState, type MdmEnrollmentState, type MdmOverview } from '@/lib/mdm-client';

function pillTone(status: MdmComplianceState | MdmEnrollmentState) {
  if (status === 'compliant' || status === 'enrolled') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'at_risk' || status === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'non_compliant' || status === 'not_enrolled') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function policyTone(status: 'pass' | 'warn' | 'fail' | 'unknown') {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'warn') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'fail') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function formatDate(value: string | null, locale: 'th' | 'en') {
  if (!value) return '-';
  const stamp = new Date(value);
  if (Number.isNaN(stamp.getTime())) return '-';
  return stamp.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US');
}

function enrollmentLabel(value: MdmEnrollmentState, locale: 'th' | 'en') {
  if (value === 'enrolled') return locale === 'th' ? 'ลงทะเบียนแล้ว' : 'Enrolled';
  if (value === 'pending') return locale === 'th' ? 'รอดำเนินการ' : 'Pending';
  if (value === 'not_enrolled') return locale === 'th' ? 'ยังไม่ลงทะเบียน' : 'Not enrolled';
  return locale === 'th' ? 'ไม่ทราบสถานะ' : 'Unknown';
}

function complianceLabel(value: MdmComplianceState, locale: 'th' | 'en') {
  if (value === 'compliant') return locale === 'th' ? 'ผ่านนโยบาย' : 'Compliant';
  if (value === 'at_risk') return locale === 'th' ? 'มีความเสี่ยง' : 'At risk';
  if (value === 'non_compliant') return locale === 'th' ? 'ไม่ผ่านนโยบาย' : 'Non-compliant';
  return locale === 'th' ? 'ไม่ทราบสถานะ' : 'Unknown';
}

export default function DeviceManagementPage() {
  const { locale } = useI18n();
  const isThai = locale === 'th';
  const [overview, setOverview] = useState<MdmOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'sync_policy' | 'recheck_compliance' | 'enroll_device' | ''>('');
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await readMdmOverview();
      setOverview(data);
    } catch (loadError) {
      setError(String(loadError instanceof Error ? loadError.message : isThai ? 'โหลดข้อมูล MDM ไม่สำเร็จ' : 'Failed to load MDM overview'));
    } finally {
      setLoading(false);
    }
  }, [isThai]);

  async function runAction(action: 'sync_policy' | 'recheck_compliance') {
    setActionLoading(action);
    setActionMessage('');
    try {
      const result = await executeMdmAction(action);
      setActionMessage(String(result?.message ?? (isThai ? 'ดำเนินการเรียบร้อย' : 'Action completed')));
      await loadOverview();
    } catch (executeError) {
      setActionMessage(String(executeError instanceof Error ? executeError.message : isThai ? 'คำสั่งล้มเหลว' : 'Action failed'));
    } finally {
      setActionLoading('');
    }
  }

  async function runEnrollDevice() {
    if (overview?.enrollmentUrl) {
      window.open(overview.enrollmentUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setActionLoading('enroll_device');
    setActionMessage('');
    try {
      const result = await executeMdmAction('enroll_device');
      const enrollmentUrl = String(result.enrollmentUrl ?? '').trim();
      if (enrollmentUrl) {
        window.open(enrollmentUrl, '_blank', 'noopener,noreferrer');
      }
      setActionMessage(String(result.message ?? (enrollmentUrl ? (isThai ? 'เปิดหน้าลงทะเบียนอุปกรณ์แล้ว' : 'Opened enrollment portal') : (isThai ? 'ส่งคำขอลงทะเบียนแล้ว' : 'Enrollment requested'))));
      await loadOverview();
    } catch (executeError) {
      setActionMessage(String(executeError instanceof Error ? executeError.message : isThai ? 'ลงทะเบียนอุปกรณ์ไม่สำเร็จ' : 'Enroll action failed'));
    } finally {
      setActionLoading('');
    }
  }

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const riskTone = useMemo(() => {
    const score = overview?.riskScore ?? 0;
    if (score >= 70) return 'text-rose-700 bg-rose-50 border-rose-200';
    if (score >= 35) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  }, [overview?.riskScore]);

  const enrollmentState = overview?.enrollmentState ?? 'unknown';
  const complianceState = overview?.complianceState ?? 'unknown';

  return (
    <section className='space-y-4 pb-24 pt-2'>
      <div className='rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)]'>
        <div className='mb-3 flex items-center gap-2'>
          <Link href='/settings' className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600'>
            <ChevronLeft className='h-4 w-4' />
          </Link>
          <div>
            <h1 className='text-lg font-semibold text-slate-900'>Device Management (MDM)</h1>
            <p className='text-xs text-slate-500'>{isThai ? 'สถานะอุปกรณ์และนโยบายความปลอดภัยจากระบบหลังบ้าน' : 'Device state and policy compliance from backend MDM'}</p>
          </div>
        </div>

        <div className='grid gap-2 sm:grid-cols-4'>
          <button
            type='button'
            onClick={() => void loadOverview()}
            disabled={loading}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-60'
          >
            <RefreshCw className={'h-4 w-4' + (loading ? ' animate-spin' : '')} />
            {isThai ? 'รีเฟรช' : 'Refresh'}
          </button>
          <button
            type='button'
            onClick={() => void runAction('sync_policy')}
            disabled={actionLoading !== ''}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 disabled:opacity-60'
          >
            <Shield className='h-4 w-4' />
            {actionLoading === 'sync_policy' ? (isThai ? 'กำลังซิงก์...' : 'Syncing...') : 'Sync policy'}
          </button>
          <button
            type='button'
            onClick={() => void runAction('recheck_compliance')}
            disabled={actionLoading !== ''}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 disabled:opacity-60'
          >
            <ShieldAlert className='h-4 w-4' />
            {actionLoading === 'recheck_compliance' ? (isThai ? 'กำลังตรวจ...' : 'Re-checking...') : 'Re-check compliance'}
          </button>
          <button
            type='button'
            onClick={() => void runEnrollDevice()}
            disabled={actionLoading !== ''}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 disabled:opacity-60'
          >
            <ExternalLink className='h-4 w-4' />
            {actionLoading === 'enroll_device' ? (isThai ? 'กำลังเปิด...' : 'Opening...') : (isThai ? 'ลงทะเบียนอุปกรณ์' : 'Enroll device')}
          </button>
        </div>

        {actionMessage ? <p className='mt-2 text-xs text-slate-600'>{actionMessage}</p> : null}
        {error ? <p className='mt-2 text-xs text-rose-600'>{error}</p> : null}

        <div className='mt-3 grid gap-3 md:grid-cols-2'>
          <div className='rounded-2xl border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs text-slate-500'>Provider</p>
            <p className='text-sm font-semibold text-slate-900'>{overview?.provider ?? '-'}</p>
            <p className='mt-2 text-xs text-slate-500'>Device</p>
            <p className='text-sm font-semibold text-slate-900'>{overview?.deviceName ?? '-'}</p>
            <div className='mt-2 flex flex-wrap gap-2'>
              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${pillTone(enrollmentState)}`}>
                {isThai ? 'การลงทะเบียน' : 'Enrollment'}: {enrollmentLabel(enrollmentState, locale)}
              </span>
              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${pillTone(complianceState)}`}>
                {isThai ? 'Compliance' : 'Compliance'}: {complianceLabel(complianceState, locale)}
              </span>
            </div>
          </div>

          <div className='rounded-2xl border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs text-slate-500'>Risk score</p>
            <p className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[12px] font-semibold ${riskTone}`}>
              <ShieldCheck className='h-3.5 w-3.5' />
              {overview?.riskScore ?? 0} / 100
            </p>
            <p className='mt-2 text-xs text-slate-600'>{overview?.riskSummary ?? '-'}</p>
            <p className='mt-2 text-[11px] text-slate-500'>{isThai ? 'เห็นล่าสุด' : 'Last seen'}: {formatDate(overview?.lastSeenAt ?? null, locale)}</p>
            <p className='text-[11px] text-slate-500'>{isThai ? 'ซิงก์นโยบายล่าสุด' : 'Last policy sync'}: {formatDate(overview?.lastPolicySyncAt ?? null, locale)}</p>
            {overview?.portalUrl ? (
              <a
                href={overview.portalUrl}
                target='_blank'
                rel='noreferrer'
                className='mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700'
              >
                {isThai ? 'เปิดพอร์ทัล MDM' : 'Open MDM portal'}
                <ExternalLink className='h-3.5 w-3.5' />
              </a>
            ) : null}
          </div>
        </div>

        <div className='mt-3 rounded-2xl border border-slate-200 bg-white p-3'>
          <p className='text-sm font-semibold text-slate-900'>{isThai ? 'ตรวจนโยบาย' : 'Policy checks'}</p>
          {overview?.policies?.length ? (
            <div className='mt-2 space-y-2'>
              {overview.policies.map((policy) => (
                <div key={policy.id} className='rounded-xl border border-slate-200 bg-slate-50 p-2'>
                  <div className='flex items-center justify-between gap-2'>
                    <p className='text-xs font-semibold text-slate-800'>{policy.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${policyTone(policy.status)}`}>
                      {policy.status.toUpperCase()}
                    </span>
                  </div>
                  {policy.note ? <p className='mt-1 text-[11px] text-slate-600'>{policy.note}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className='mt-2 text-xs text-slate-500'>{isThai ? 'ยังไม่มีรายการ policy จาก backend' : 'No policy items from backend yet'}</p>
          )}
        </div>
      </div>
    </section>
  );
}

