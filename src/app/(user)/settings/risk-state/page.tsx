'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ChevronLeft, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n/provider';
import { useToast } from '@/components/ui/toast';
import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';
import { runVaultRiskEvaluation } from '@/lib/vault-risk-client';

type RiskStateResponse = {
  ok?: boolean;
  active?: boolean;
  policy?: {
    assessedAt: string;
    expiresAt: string;
    score: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    actions: string[];
    lockDurationSec: number;
    reasonCodes: string[];
  } | null;
  latestAssessment?: {
    createdAt?: string;
    score?: number;
    severity?: string;
    actions?: string[];
    confidenceWarnings?: string[];
    source?: string;
    trigger?: string;
    playIntegrity?: {
      status?: string;
      verdict?: string;
      reasonCodes?: string[];
      appRecognitionVerdict?: string;
      deviceRecognitionVerdicts?: string[];
      nonceMatched?: boolean;
      packageMatched?: boolean;
      timestampFresh?: boolean;
      errorMessage?: string;
    } | null;
    riskFactors?: Array<{ code?: string; type?: string; score?: number }>;
  } | null;
};

function severityBadgeClass(severity: string | undefined) {
  if (severity === 'critical') return 'border-rose-300 bg-rose-50 text-rose-700';
  if (severity === 'high') return 'border-orange-300 bg-orange-50 text-orange-700';
  if (severity === 'medium') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (severity === 'low') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function toLocalDate(value: string | undefined, locale: 'th' | 'en') {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US');
}

function toRiskActionLabel(action: string, locale: 'th' | 'en') {
  if (action === 'notify_user') return locale === 'th' ? 'แจ้งเตือนผู้ใช้' : 'Notify user';
  if (action === 'limit_sensitive_actions') return locale === 'th' ? 'จำกัดฟังก์ชันสำคัญ' : 'Limit sensitive actions';
  if (action === 'force_reauth') return locale === 'th' ? 'บังคับยืนยันตัวตนใหม่' : 'Force re-authentication';
  if (action === 'suggest_uninstall_risky_apps') return locale === 'th' ? 'แนะนำให้ถอนแอปเสี่ยง' : 'Suggest uninstall risky apps';
  if (action === 'block_sync') return locale === 'th' ? 'บล็อกการซิงก์' : 'Block sync';
  if (action === 'block_sensitive_data') return locale === 'th' ? 'บล็อกข้อมูลอ่อนไหว' : 'Block sensitive data';
  if (action === 'lock_vault_temporarily') return locale === 'th' ? 'ล็อก Vault ชั่วคราว' : 'Temporarily lock Vault';
  return action;
}

function toSeverityLabel(severity: string | undefined, locale: 'th' | 'en') {
  if (locale !== 'th') return String(severity ?? 'unknown').toUpperCase();
  if (severity === 'low') return 'ต่ำ';
  if (severity === 'medium') return 'ปานกลาง';
  if (severity === 'high') return 'สูง';
  if (severity === 'critical') return 'วิกฤต';
  return 'ไม่ทราบ';
}

export default function RiskStatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [state, setState] = useState<RiskStateResponse | null>(null);
  const [canRecheck, setCanRecheck] = useState(false);
  const isThai = locale === 'th';
  const guideMode = searchParams.get('guide') === '1';
  const safeMode = searchParams.get('safe') === '1';

  const loadState = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/security/risk-state', { method: 'GET', cache: 'no-store' });
    const body = (await response.json().catch(() => ({}))) as RiskStateResponse;
    setLoading(false);
    if (!response.ok) {
      showToast(isThai ? 'โหลดสถานะความเสี่ยงไม่สำเร็จ' : 'Failed to load risk state', 'error');
      return;
    }
    setState(body);
  }, [isThai, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadState();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const runtime = detectRuntimeCapabilities();
      setCanRecheck(runtime.isCapacitorNative && runtime.isAndroid);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function runRecheckNow() {
    if (!canRecheck) {
      showToast(
        isThai
          ? 'การตรวจเช็กทันทีรองรับเฉพาะ Android Native APK'
          : 'Immediate re-check is available only on Android native APK.',
        'error',
      );
      return;
    }

    setRechecking(true);
    const result = await runVaultRiskEvaluation('manual_risk_state_page');
    setRechecking(false);

    if (!result.ok || !result.assessment) {
      showToast(isThai ? 'ประเมินความเสี่ยงไม่สำเร็จ' : 'Risk evaluation failed', 'error');
      return;
    }

    showToast(
      isThai
        ? `ประเมินแล้ว: ${toSeverityLabel(result.assessment.severity, 'th')} (คะแนน ${result.assessment.score})`
        : `Evaluated: ${result.assessment.severity.toUpperCase()} (score ${result.assessment.score})`,
      result.assessment.severity === 'low' ? 'success' : 'error',
    );

    await loadState();
  }

  const activeSeverity = state?.policy?.severity ?? state?.latestAssessment?.severity ?? 'unknown';
  const activeScore = state?.policy?.score ?? state?.latestAssessment?.score ?? 0;

  return (
    <section className='space-y-4 pb-24 pt-2'>
      <div className='flex items-center gap-2'>
        <Button type='button' variant='secondary' className='h-9 w-9 rounded-xl p-0' onClick={() => router.push('/settings')}>
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <h1 className='text-2xl font-semibold text-slate-900'>{isThai ? 'สถานะความเสี่ยง' : 'Risk State'}</h1>
      </div>

      <Card className='space-y-3 rounded-[20px] p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <p className='text-sm font-semibold text-slate-800'>{isThai ? 'สถานะความเสี่ยงปัจจุบัน' : 'Current risk status'}</p>
            <p className='mt-1 text-xs text-slate-500'>
              {isThai ? 'อัปเดตล่าสุดจาก Vault Shield + Play Integrity' : 'Latest status from Vault Shield + Play Integrity'}
            </p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${severityBadgeClass(String(activeSeverity))}`}>
            {toSeverityLabel(String(activeSeverity), locale)} • {activeScore}
          </span>
        </div>

        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs font-semibold text-slate-600'>{isThai ? 'สถานะนโยบาย' : 'Policy Active'}</p>
            <p className='mt-1 text-sm font-semibold text-slate-800'>{state?.active ? (isThai ? 'ใช้งานอยู่' : 'Active') : (isThai ? 'ไม่ใช้งาน' : 'Inactive')}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs font-semibold text-slate-600'>{isThai ? 'วันหมดอายุนโยบาย' : 'Policy Expiry'}</p>
            <p className='mt-1 text-sm font-semibold text-slate-800'>{toLocalDate(state?.policy?.expiresAt, locale)}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs font-semibold text-slate-600'>{isThai ? 'การประเมินล่าสุด' : 'Latest Assessment'}</p>
            <p className='mt-1 text-sm font-semibold text-slate-800'>{toLocalDate(state?.latestAssessment?.createdAt, locale)}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs font-semibold text-slate-600'>{isThai ? 'แหล่งที่มา / ตัวกระตุ้น' : 'Source / Trigger'}</p>
            <p className='mt-1 text-sm font-semibold text-slate-800'>
              {String(state?.latestAssessment?.source ?? '-')} / {String(state?.latestAssessment?.trigger ?? '-')}
            </p>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2'>
          <Button type='button' className='h-10 rounded-xl' onClick={() => void runRecheckNow()} disabled={rechecking}>
            <RefreshCw className={'mr-2 h-4 w-4 ' + (rechecking ? 'animate-spin' : '')} />
            {isThai ? 'ตรวจใหม่ตอนนี้' : 'Re-check now'}
          </Button>
          <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={() => void loadState()} disabled={loading}>
            {loading ? (isThai ? 'กำลังรีเฟรช...' : 'Refreshing...') : (isThai ? 'รีเฟรชสถานะ' : 'Refresh status')}
          </Button>
        </div>
        {!canRecheck ? (
          <p className='text-xs text-slate-500'>
            {isThai
              ? 'หมายเหตุ: ปุ่มตรวจใหม่ใช้ได้เฉพาะ Android Native APK ที่มี VaultShield plugin'
              : 'Note: Re-check button works only on Android native APK with VaultShield plugin.'}
          </p>
        ) : null}
      </Card>

      <Card className='space-y-3 rounded-[20px] p-4'>
        <p className='text-sm font-semibold text-slate-800'>{isThai ? 'มาตรการตอบสนองของ Vault' : 'Vault Response Actions'}</p>
        {state?.policy?.actions?.length ? (
          <div className='space-y-2'>
            {state.policy.actions.map((action) => (
              <div key={action} className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800'>
                {toRiskActionLabel(action, locale)}
              </div>
            ))}
          </div>
        ) : (
          <div className='rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>
            {isThai ? 'ยังไม่มี action ที่บังคับใช้อยู่' : 'No active enforcement actions right now.'}
          </div>
        )}
      </Card>

      <Card className='space-y-3 rounded-[20px] p-4'>
        <p className='text-sm font-semibold text-slate-800'>Play Integrity</p>
        {state?.latestAssessment?.playIntegrity ? (
          <div className='space-y-2 text-sm text-slate-700'>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
              {isThai ? 'สถานะ' : 'status'}: {String(state.latestAssessment.playIntegrity.status ?? '-')} | {isThai ? 'ผลตัดสิน' : 'verdict'}:{' '}
              {String(state.latestAssessment.playIntegrity.verdict ?? '-')}
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
              {isThai ? 'ผลยืนยันแอป' : 'appRecognitionVerdict'}: {String(state.latestAssessment.playIntegrity.appRecognitionVerdict ?? '-')}
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
              {isThai ? 'ผลยืนยันอุปกรณ์' : 'deviceRecognitionVerdicts'}:{' '}
              {Array.isArray(state.latestAssessment.playIntegrity.deviceRecognitionVerdicts) ? state.latestAssessment.playIntegrity.deviceRecognitionVerdicts.join(', ') : '-'}
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
              {isThai ? 'nonce ตรงกัน' : 'nonceMatched'}: {String(state.latestAssessment.playIntegrity.nonceMatched ?? '-')} | {isThai ? 'package ตรงกัน' : 'packageMatched'}:{' '}
              {String(state.latestAssessment.playIntegrity.packageMatched ?? '-')} | {isThai ? 'เวลาอยู่ในเกณฑ์' : 'timestampFresh'}:{' '}
              {String(state.latestAssessment.playIntegrity.timestampFresh ?? '-')}
            </div>
            {state.latestAssessment.playIntegrity.errorMessage ? (
              <div className='rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700'>
                {isThai ? 'ข้อผิดพลาด' : 'error'}: {state.latestAssessment.playIntegrity.errorMessage}
              </div>
            ) : null}
          </div>
        ) : (
          <div className='rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'>
            {isThai ? 'ยังไม่มีข้อมูล Play Integrity ล่าสุด' : 'No recent Play Integrity data yet.'}
          </div>
        )}
      </Card>

      <Card className='space-y-3 rounded-[20px] p-4'>
        <p className='text-sm font-semibold text-slate-800'>{isThai ? 'Risk Factors ล่าสุด' : 'Latest Risk Factors'}</p>
        {state?.latestAssessment?.riskFactors?.length ? (
          <div className='space-y-2'>
            {state.latestAssessment.riskFactors.map((factor, index) => (
              <div key={`${factor.code ?? 'factor'}-${index}`} className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800'>
                {String(factor.code ?? '-')} ({isThai ? `ประเภท: ${String(factor.type ?? '-')}` : String(factor.type ?? '-')}) • +{Number(factor.score ?? 0)}
              </div>
            ))}
          </div>
        ) : (
          <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600'>
            {isThai ? 'ไม่มีปัจจัยเสี่ยงล่าสุด' : 'No recent factors.'}
          </div>
        )}
      </Card>

      <Card className={'space-y-2 rounded-[20px] p-4 ' + (guideMode || safeMode ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50')}>
        <p className='inline-flex items-center gap-2 text-sm font-semibold text-slate-800'>
          {state?.active ? <ShieldX className='h-4 w-4 text-rose-600' /> : <ShieldCheck className='h-4 w-4 text-emerald-600' />}
          {safeMode ? (isThai ? 'คำแนะนำโหมดปลอดภัย' : 'Safe Mode Guidance') : isThai ? (guideMode ? 'แนวทางแก้ไขแบบคลิกเดียว' : 'คำแนะนำ') : (guideMode ? 'One-click Guidance' : 'Guidance')}
        </p>
        <p className='text-xs leading-5 text-slate-600'>
          {safeMode
            ? (isThai
              ? 'โหมดปลอดภัยเหมาะสำหรับช่วงที่ระบบประเมินเป็น Critical เพื่อจำกัดการเข้าถึงข้อมูลอ่อนไหวชั่วคราวจนกว่าความเสี่ยงจะลดลง'
              : 'Safe mode is recommended while risk is Critical to temporarily limit access to sensitive data until risk decreases.')
            : isThai
              ? 'ถ้าระบบขึ้น High/Critical ให้ถอนแอปเสี่ยง ปิด ADB/Developer Options และติดตั้งจาก Google Play เพื่อลดความเสี่ยง'
              : 'If status is High/Critical, remove risky apps, disable ADB/Developer Options, and install from Google Play to reduce risk.'}
        </p>
        {guideMode ? (
          <div className='rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700'>
            <p className='font-semibold text-slate-800'>{isThai ? 'เช็กลิสต์การแก้ไขความเสี่ยง' : 'Remediation checklist'}</p>
            <ol className='mt-1 list-decimal space-y-1 pl-4'>
              <li>{isThai ? 'ถอนแอปที่ถูกจัดว่าเสี่ยงจากเครื่อง' : 'Uninstall flagged risky apps from the device.'}</li>
              <li>{isThai ? 'ปิด Developer options และ ADB' : 'Disable Developer options and ADB.'}</li>
              <li>{isThai ? 'ติดตั้ง/อัปเดตแอปจาก Google Play' : 'Install/update the app from Google Play.'}</li>
              <li>{isThai ? 'กด "ตรวจใหม่ตอนนี้" เพื่อประเมินซ้ำ' : 'Tap Re-check now to verify remediation.'}</li>
            </ol>
          </div>
        ) : null}
        {safeMode ? (
          <div className='rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700'>
            <p className='font-semibold text-slate-800'>{isThai ? 'ขั้นตอน Safe Mode' : 'Safe mode steps'}</p>
            <ol className='mt-1 list-decimal space-y-1 pl-4'>
              <li>{isThai ? 'หยุดเปิด/คัดลอกข้อมูลสำคัญชั่วคราว' : 'Pause viewing/copying sensitive data temporarily.'}</li>
              <li>{isThai ? 'หลีกเลี่ยงการซิงก์จนกว่าจะตรวจซ้ำผ่าน' : 'Avoid syncing until re-check passes.'}</li>
              <li>{isThai ? 'จัดการแอปเสี่ยงและปิดโหมดนักพัฒนา' : 'Remove risky apps and disable developer options.'}</li>
              <li>{isThai ? 'ยืนยันตัวตนใหม่และกดตรวจซ้ำ' : 'Re-authenticate and run re-check.'}</li>
            </ol>
          </div>
        ) : null}
        {state?.latestAssessment?.confidenceWarnings?.length ? (
          <div className='rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'>
            <p className='mb-1 inline-flex items-center gap-1 font-semibold'>
              <AlertTriangle className='h-3.5 w-3.5' />
              {isThai ? 'คำเตือนด้านความเชื่อมั่น' : 'Confidence warnings'}
            </p>
            <p>{state.latestAssessment.confidenceWarnings.join(', ')}</p>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
