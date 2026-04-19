'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ChevronLeft, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { I18nKey } from '@/i18n/messages';
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

const riskActionKeyMap: Record<string, I18nKey> = {
  notify_user: 'riskState.actions.notifyUser',
  limit_sensitive_actions: 'riskState.actions.limitSensitiveActions',
  force_reauth: 'riskState.actions.forceReauth',
  suggest_uninstall_risky_apps: 'riskState.actions.suggestUninstallRiskyApps',
  block_sync: 'riskState.actions.blockSync',
  block_sensitive_data: 'riskState.actions.blockSensitiveData',
  lock_vault_temporarily: 'riskState.actions.lockVaultTemporarily',
};

const severityKeyMap: Record<string, I18nKey> = {
  low: 'riskState.severityLow',
  medium: 'riskState.severityMedium',
  high: 'riskState.severityHigh',
  critical: 'riskState.severityCritical',
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

function toRiskActionLabel(action: string, t: (key: I18nKey) => string) {
  const key = riskActionKeyMap[action];
  return key ? t(key) : action;
}

function toSeverityLabel(severity: string | undefined, t: (key: I18nKey) => string) {
  const key = severityKeyMap[String(severity)];
  return key ? t(key) : t('riskState.severityUnknown');
}

export default function RiskStatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useI18n();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [state, setState] = useState<RiskStateResponse | null>(null);
  const [canRecheck, setCanRecheck] = useState(false);

  const guideMode = searchParams.get('guide') === '1';
  const safeMode = searchParams.get('safe') === '1';

  const loadState = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/security/risk-state', { method: 'GET', cache: 'no-store' });
    const body = (await response.json().catch(() => ({}))) as RiskStateResponse;
    setLoading(false);
    if (!response.ok) {
      showToast(t('riskState.loadFailed'), 'error');
      return;
    }
    setState(body);
  }, [showToast, t]);

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
      showToast(t('riskState.androidOnlyRecheck'), 'error');
      return;
    }

    setRechecking(true);
    const result = await runVaultRiskEvaluation('manual_risk_state_page');
    setRechecking(false);

    if (!result.ok || !result.assessment) {
      showToast(t('riskState.evaluationFailed'), 'error');
      return;
    }

    showToast(
      `${t('riskState.evaluatedPrefix')}: ${toSeverityLabel(result.assessment.severity, t)} (${t('riskState.scoreLabel')} ${result.assessment.score})`,
      result.assessment.severity === 'low' ? 'success' : 'error',
    );

    await loadState();
  }

  const activeSeverity = state?.policy?.severity ?? state?.latestAssessment?.severity ?? 'unknown';
  const activeScore = state?.policy?.score ?? state?.latestAssessment?.score ?? 0;
  const guidanceTitle = safeMode
    ? t('riskState.safeModeGuidance')
    : guideMode
      ? t('riskState.oneClickGuidance')
      : t('riskState.guidance');
  const guidanceDescription = safeMode ? t('riskState.safeModeDescription') : t('riskState.defaultDescription');

  return (
    <section className='space-y-4 pb-24 pt-2'>
      <div className='flex items-center gap-2'>
        <Button type='button' variant='secondary' className='h-9 w-9 rounded-xl p-0' onClick={() => router.push('/settings')}>
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <h1 className='text-2xl font-semibold text-slate-900'>{t('riskState.title')}</h1>
      </div>

      <Card className='space-y-3 rounded-[20px] p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <p className='text-sm font-semibold text-slate-800'>{t('riskState.currentRiskStatus')}</p>
            <p className='mt-1 text-xs text-slate-500'>{t('riskState.latestStatusSource')}</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${severityBadgeClass(String(activeSeverity))}`}>
            {toSeverityLabel(String(activeSeverity), t)} • {activeScore}
          </span>
        </div>

        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs font-semibold text-slate-600'>{t('riskState.policyActiveLabel')}</p>
            <p className='mt-1 text-sm font-semibold text-slate-800'>{state?.active ? t('riskState.policyActiveValue') : t('riskState.policyInactiveValue')}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs font-semibold text-slate-600'>{t('riskState.policyExpiryLabel')}</p>
            <p className='mt-1 text-sm font-semibold text-slate-800'>{toLocalDate(state?.policy?.expiresAt, locale)}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs font-semibold text-slate-600'>{t('riskState.latestAssessmentLabel')}</p>
            <p className='mt-1 text-sm font-semibold text-slate-800'>{toLocalDate(state?.latestAssessment?.createdAt, locale)}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs font-semibold text-slate-600'>{t('riskState.sourceTriggerLabel')}</p>
            <p className='mt-1 text-sm font-semibold text-slate-800'>
              {String(state?.latestAssessment?.source ?? '-')} / {String(state?.latestAssessment?.trigger ?? '-')}
            </p>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2'>
          <Button type='button' className='h-10 rounded-xl' onClick={() => void runRecheckNow()} disabled={rechecking}>
            <RefreshCw className={'mr-2 h-4 w-4 ' + (rechecking ? 'animate-spin' : '')} />
            {t('riskState.recheckNow')}
          </Button>
          <Button type='button' variant='secondary' className='h-10 rounded-xl' onClick={() => void loadState()} disabled={loading}>
            {loading ? t('riskState.refreshing') : t('riskState.refreshStatus')}
          </Button>
        </div>

        {!canRecheck ? <p className='text-xs text-slate-500'>{t('riskState.noteAndroidOnly')}</p> : null}
      </Card>

      <Card className='space-y-3 rounded-[20px] p-4'>
        <p className='text-sm font-semibold text-slate-800'>{t('riskState.vaultResponseActions')}</p>
        {state?.policy?.actions?.length ? (
          <div className='space-y-2'>
            {state.policy.actions.map((action) => (
              <div key={action} className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800'>
                {toRiskActionLabel(action, t)}
              </div>
            ))}
          </div>
        ) : (
          <div className='rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>{t('riskState.noActiveActions')}</div>
        )}
      </Card>

      <Card className='space-y-3 rounded-[20px] p-4'>
        <p className='text-sm font-semibold text-slate-800'>{t('riskState.playIntegrityTitle')}</p>
        {state?.latestAssessment?.playIntegrity ? (
          <div className='space-y-2 text-sm text-slate-700'>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
              {t('riskState.playIntegrityStatus')}: {String(state.latestAssessment.playIntegrity.status ?? '-')} | {t('riskState.playIntegrityVerdict')}:{' '}
              {String(state.latestAssessment.playIntegrity.verdict ?? '-')}
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
              {t('riskState.playIntegrityAppRecognition')}: {String(state.latestAssessment.playIntegrity.appRecognitionVerdict ?? '-')}
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
              {t('riskState.playIntegrityDeviceRecognition')}:{' '}
              {Array.isArray(state.latestAssessment.playIntegrity.deviceRecognitionVerdicts)
                ? state.latestAssessment.playIntegrity.deviceRecognitionVerdicts.join(', ')
                : '-'}
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
              {t('riskState.playIntegrityNonceMatched')}: {String(state.latestAssessment.playIntegrity.nonceMatched ?? '-')} |{' '}
              {t('riskState.playIntegrityPackageMatched')}: {String(state.latestAssessment.playIntegrity.packageMatched ?? '-')} |{' '}
              {t('riskState.playIntegrityTimestampFresh')}: {String(state.latestAssessment.playIntegrity.timestampFresh ?? '-')}
            </div>
            {state.latestAssessment.playIntegrity.errorMessage ? (
              <div className='rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700'>
                {t('riskState.playIntegrityError')}: {state.latestAssessment.playIntegrity.errorMessage}
              </div>
            ) : null}
          </div>
        ) : (
          <div className='rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'>{t('riskState.noPlayIntegrityData')}</div>
        )}
      </Card>

      <Card className='space-y-3 rounded-[20px] p-4'>
        <p className='text-sm font-semibold text-slate-800'>{t('riskState.latestRiskFactors')}</p>
        {state?.latestAssessment?.riskFactors?.length ? (
          <div className='space-y-2'>
            {state.latestAssessment.riskFactors.map((factor, index) => (
              <div key={`${factor.code ?? 'factor'}-${index}`} className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800'>
                {String(factor.code ?? '-')} ({t('riskState.riskFactorTypeLabel')}: {String(factor.type ?? '-')}) • +{Number(factor.score ?? 0)}
              </div>
            ))}
          </div>
        ) : (
          <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600'>{t('riskState.noRecentFactors')}</div>
        )}
      </Card>

      <Card className={'space-y-2 rounded-[20px] p-4 ' + (guideMode || safeMode ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50')}>
        <p className='inline-flex items-center gap-2 text-sm font-semibold text-slate-800'>
          {state?.active ? <ShieldX className='h-4 w-4 text-rose-600' /> : <ShieldCheck className='h-4 w-4 text-emerald-600' />}
          {guidanceTitle}
        </p>
        <p className='text-xs leading-5 text-slate-600'>{guidanceDescription}</p>

        {guideMode ? (
          <div className='rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700'>
            <p className='font-semibold text-slate-800'>{t('riskState.remediationChecklist')}</p>
            <ol className='mt-1 list-decimal space-y-1 pl-4'>
              <li>{t('riskState.remediationStep1')}</li>
              <li>{t('riskState.remediationStep2')}</li>
              <li>{t('riskState.remediationStep3')}</li>
              <li>{t('riskState.remediationStep4')}</li>
            </ol>
          </div>
        ) : null}

        {safeMode ? (
          <div className='rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700'>
            <p className='font-semibold text-slate-800'>{t('riskState.safeModeStepsTitle')}</p>
            <ol className='mt-1 list-decimal space-y-1 pl-4'>
              <li>{t('riskState.safeModeStep1')}</li>
              <li>{t('riskState.safeModeStep2')}</li>
              <li>{t('riskState.safeModeStep3')}</li>
              <li>{t('riskState.safeModeStep4')}</li>
            </ol>
          </div>
        ) : null}

        {state?.latestAssessment?.confidenceWarnings?.length ? (
          <div className='rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'>
            <p className='mb-1 inline-flex items-center gap-1 font-semibold'>
              <AlertTriangle className='h-3.5 w-3.5' />
              {t('riskState.confidenceWarnings')}
            </p>
            <p>{state.latestAssessment.confidenceWarnings.join(', ')}</p>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
