'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, FileSearch, Link2, ShieldCheck, ShieldX, Smartphone } from 'lucide-react';
import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';
import {
  readVaultShieldDeviceSecurityState,
  scanVaultShieldInstalledApps,
  type VaultShieldAppScanResult,
  type VaultShieldDeviceSecurityState,
  type VaultShieldInstalledAppRisk,
} from '@/lib/vault-shield';

type PhoneRiskTelemetrySignals = {
  numberInContacts?: boolean;
  spamLikeCallPattern?: boolean;
  networkOrSimAnomaly?: boolean;
  frequentSimChanges?: boolean;
  abnormalSignalOrCellInfo?: boolean;
  riskyVoipOrRelayApps?: boolean;
  rootedOrTamperedOrSideloaded?: boolean;
  gatewayOrMassCallingBehavior?: boolean;
  suspiciousCallAttempts1h?: number;
  outboundCalls24h?: number;
  distinctCallees24h?: number;
};

type PhoneRiskResult = {
  number: string;
  level: 'safe' | 'suspicious' | 'high_risk';
  score: number;
  verdict: string;
  reasons: string[];
  riskSignals?: PhoneRiskTelemetrySignals;
  intelligence?: {
    signalRiskScore?: number;
  };
};

type UrlScanResult = {
  score: number;
  verdict: string;
  level: 'safe' | 'suspicious' | 'high_risk';
  indicators: string[];
  domainAgeDays: number | null;
};

type FileScanResult = {
  score: number;
  verdict: string;
  level: 'safe' | 'suspicious' | 'high_risk';
  indicators: string[];
  sha256: string;
  permissionInspection: 'not_available' | 'provided_by_native';
};

function tone(level: 'safe' | 'suspicious' | 'high_risk') {
  if (level === 'safe') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (level === 'suspicious') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function appLevelLabel(level: VaultShieldInstalledAppRisk['riskLevel']) {
  if (level === 'remove') return 'ควรถอนการติดตั้ง';
  if (level === 'risky') return 'เสี่ยง';
  if (level === 'review') return 'ควรตรวจเพิ่ม';
  return 'ปลอดภัย';
}

function bytesLabel(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function clampInt(input: number, min: number, max: number) {
  if (!Number.isFinite(input)) return min;
  return Math.max(min, Math.min(max, Math.round(input)));
}

function deriveSignalsFromDevice(
  appScanResult: VaultShieldAppScanResult | null,
  deviceState: VaultShieldDeviceSecurityState | null,
): Partial<PhoneRiskTelemetrySignals> {
  const apps = appScanResult?.apps ?? [];
  const relayOrVoipKeywords = ['voip', 'sip', 'dialer', 'caller', 'callrelay', 'pbx', 'phone', 'textnow'];

  const relayApps = apps.filter((app) => {
    const source = `${app.packageName} ${app.appName}`.toLowerCase();
    return relayOrVoipKeywords.some((kw) => source.includes(kw)) && app.riskLevel !== 'safe';
  });

  const highTrafficApps = apps.filter((app) => app.networkTxBytes + app.networkRxBytes > 60 * 1024 * 1024);
  const highDialerDensity = apps.filter((app) => {
    const source = `${app.packageName} ${app.appName}`.toLowerCase();
    return source.includes('call') || source.includes('dial') || source.includes('voip') || source.includes('sip');
  }).length;

  const rootedOrTampered = Boolean(
    deviceState?.suBinaryDetected ||
      deviceState?.hasTestKeys ||
      deviceState?.unknownSourcesEnabled ||
      deviceState?.developerOptionsEnabled ||
      deviceState?.adbEnabled,
  );

  return {
    rootedOrTamperedOrSideloaded: rootedOrTampered,
    riskyVoipOrRelayApps: relayApps.length >= 1,
    networkOrSimAnomaly: Boolean(deviceState?.vpnActive),
    gatewayOrMassCallingBehavior: highDialerDensity >= 3 || highTrafficApps.length >= 6,
  };
}

async function sha256Hex(file: File) {
  const data = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export default function RiskCheckPage() {
  const runtime = detectRuntimeCapabilities();
  const isAndroidNative = runtime.isCapacitorNative && runtime.isAndroid;

  const [number, setNumber] = useState('');
  const [phoneResult, setPhoneResult] = useState<PhoneRiskResult | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);

  const [signals, setSignals] = useState<PhoneRiskTelemetrySignals>({
    suspiciousCallAttempts1h: 0,
    outboundCalls24h: 0,
    distinctCallees24h: 0,
  });

  const [appScanLoading, setAppScanLoading] = useState(false);
  const [appScanResult, setAppScanResult] = useState<VaultShieldAppScanResult | null>(null);
  const [deviceState, setDeviceState] = useState<VaultShieldDeviceSecurityState | null>(null);
  const [appScanError, setAppScanError] = useState('');

  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlResult, setUrlResult] = useState<UrlScanResult | null>(null);
  const [urlError, setUrlError] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileResult, setFileResult] = useState<FileScanResult | null>(null);
  const [fileError, setFileError] = useState('');

  const topRiskApps = useMemo(() => {
    const apps = appScanResult?.apps ?? [];
    return [...apps].sort((left, right) => right.riskScore - left.riskScore).slice(0, 8);
  }, [appScanResult]);

  const highRiskApps = useMemo(
    () => (appScanResult?.apps ?? []).filter((item) => item.riskLevel === 'remove' || item.riskLevel === 'risky'),
    [appScanResult],
  );

  function updateSignal<K extends keyof PhoneRiskTelemetrySignals>(key: K, value: PhoneRiskTelemetrySignals[K]) {
    setSignals((prev) => ({ ...prev, [key]: value }));
  }

  function applyAutoSignalsFromDevice() {
    const derived = deriveSignalsFromDevice(appScanResult, deviceState);
    setSignals((prev) => ({ ...prev, ...derived }));
  }

  async function runPhoneCheck() {
    setPhoneLoading(true);
    try {
      const payloadSignals: PhoneRiskTelemetrySignals = {
        ...signals,
        suspiciousCallAttempts1h: clampInt(Number(signals.suspiciousCallAttempts1h ?? 0), 0, 500),
        outboundCalls24h: clampInt(Number(signals.outboundCalls24h ?? 0), 0, 5000),
        distinctCallees24h: clampInt(Number(signals.distinctCallees24h ?? 0), 0, 5000),
      };

      const response = await fetch('/api/phone/risk-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, telemetrySignals: payloadSignals }),
      });
      const payload = (await response.json()) as { result?: PhoneRiskResult };
      setPhoneResult(payload.result ?? null);
    } finally {
      setPhoneLoading(false);
    }
  }

  async function runAppScan() {
    setAppScanError('');
    setAppScanLoading(true);
    try {
      if (!isAndroidNative) {
        setAppScanError('ฟีเจอร์นี้ต้องใช้งานผ่าน Android APK เท่านั้น (PWA มีข้อจำกัดการเข้าถึงรายชื่อแอปทั้งเครื่อง)');
        return;
      }

      const [apps, security] = await Promise.all([scanVaultShieldInstalledApps(260), readVaultShieldDeviceSecurityState()]);

      if (!apps) {
        setAppScanError('ไม่สามารถอ่านรายการแอปจากเครื่องได้');
        return;
      }

      setAppScanResult(apps);
      setDeviceState(security ?? null);
    } finally {
      setAppScanLoading(false);
    }
  }

  async function runUrlScan() {
    setUrlError('');
    setUrlLoading(true);
    try {
      const response = await fetch('/api/security/url-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      });
      const payload = (await response.json()) as { result?: UrlScanResult; error?: string };
      if (!response.ok) {
        setUrlError(payload.error || 'ไม่สามารถสแกน URL ได้');
        setUrlResult(null);
        return;
      }
      setUrlResult(payload.result ?? null);
    } finally {
      setUrlLoading(false);
    }
  }

  async function runFileScan() {
    setFileError('');
    setFileLoading(true);
    try {
      if (!selectedFile) {
        setFileError('กรุณาเลือกไฟล์ก่อน');
        return;
      }
      const hash = await sha256Hex(selectedFile);
      const response = await fetch('/api/security/file-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          sha256: hash,
          isApk: selectedFile.name.toLowerCase().endsWith('.apk'),
        }),
      });
      const payload = (await response.json()) as { result?: FileScanResult; error?: string };
      if (!response.ok) {
        setFileError(payload.error || 'ไม่สามารถสแกนไฟล์ได้');
        setFileResult(null);
        return;
      }
      setFileResult(payload.result ?? null);
    } finally {
      setFileLoading(false);
    }
  }

  return (
    <section className='space-y-3'>
      <div className='rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm'>
        <h1 className='text-lg font-semibold text-slate-900'>หน้าตรวจความเสี่ยง</h1>
        <p className='mt-1 text-sm text-slate-600'>สแกนเบอร์เสี่ยง สแกนลิงก์ สแกนไฟล์ และวิเคราะห์สัญญาณต้องสงสัยจากอุปกรณ์</p>

        <div className='mt-3 grid gap-3 md:grid-cols-2'>
          <div className='rounded-xl border border-slate-200 bg-white p-3'>
            <p className='text-sm font-semibold text-slate-900'>ตรวจเบอร์เสี่ยง</p>
            <input
              type='tel'
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder='เช่น 08x-xxx-xxxx'
              className='mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400'
            />

            <div className='mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2'>
              <p className='text-xs font-semibold text-slate-800'>ประเมินหลายสัญญาณร่วมกัน (SIM box / สายปลอม / สายต้องสงสัย)</p>
              <div className='mt-2 grid gap-2'>
                <label className='flex items-center gap-2 text-[11px] text-slate-700'>
                  <input
                    type='checkbox'
                    checked={signals.numberInContacts === false}
                    onChange={(event) => updateSignal('numberInContacts', event.target.checked ? false : undefined)}
                  />
                  เบอร์ไม่อยู่ในรายชื่อ
                </label>
                <label className='flex items-center gap-2 text-[11px] text-slate-700'>
                  <input
                    type='checkbox'
                    checked={Boolean(signals.spamLikeCallPattern)}
                    onChange={(event) => updateSignal('spamLikeCallPattern', event.target.checked)}
                  />
                  รูปแบบสายเข้าคล้ายสแปม
                </label>
                <label className='flex items-center gap-2 text-[11px] text-slate-700'>
                  <input
                    type='checkbox'
                    checked={Boolean(signals.networkOrSimAnomaly)}
                    onChange={(event) => updateSignal('networkOrSimAnomaly', event.target.checked)}
                  />
                  เครือข่าย/ซิมมีความผิดปกติ
                </label>
                <label className='flex items-center gap-2 text-[11px] text-slate-700'>
                  <input
                    type='checkbox'
                    checked={Boolean(signals.frequentSimChanges)}
                    onChange={(event) => updateSignal('frequentSimChanges', event.target.checked)}
                  />
                  เปลี่ยนซิมบ่อยผิดปกติ
                </label>
                <label className='flex items-center gap-2 text-[11px] text-slate-700'>
                  <input
                    type='checkbox'
                    checked={Boolean(signals.abnormalSignalOrCellInfo)}
                    onChange={(event) => updateSignal('abnormalSignalOrCellInfo', event.target.checked)}
                  />
                  สัญญาณ / cell info ผิดปกติช่วงเสี่ยง
                </label>
                <label className='flex items-center gap-2 text-[11px] text-slate-700'>
                  <input
                    type='checkbox'
                    checked={Boolean(signals.riskyVoipOrRelayApps)}
                    onChange={(event) => updateSignal('riskyVoipOrRelayApps', event.target.checked)}
                  />
                  มีแอป VoIP/Relay เสี่ยง
                </label>
                <label className='flex items-center gap-2 text-[11px] text-slate-700'>
                  <input
                    type='checkbox'
                    checked={Boolean(signals.rootedOrTamperedOrSideloaded)}
                    onChange={(event) => updateSignal('rootedOrTamperedOrSideloaded', event.target.checked)}
                  />
                  เครื่องมี root / tamper / sideload
                </label>
                <label className='flex items-center gap-2 text-[11px] text-slate-700'>
                  <input
                    type='checkbox'
                    checked={Boolean(signals.gatewayOrMassCallingBehavior)}
                    onChange={(event) => updateSignal('gatewayOrMassCallingBehavior', event.target.checked)}
                  />
                  พฤติกรรมคล้าย gateway / mass-calling
                </label>
              </div>

              <div className='mt-2 grid gap-2 md:grid-cols-3'>
                <label className='text-[11px] text-slate-700'>
                  สายต้องสงสัย 1 ชม.
                  <input
                    type='number'
                    min={0}
                    max={500}
                    value={signals.suspiciousCallAttempts1h ?? 0}
                    onChange={(event) => updateSignal('suspiciousCallAttempts1h', clampInt(Number(event.target.value), 0, 500))}
                    className='mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs'
                  />
                </label>
                <label className='text-[11px] text-slate-700'>
                  โทรออก 24 ชม.
                  <input
                    type='number'
                    min={0}
                    max={5000}
                    value={signals.outboundCalls24h ?? 0}
                    onChange={(event) => updateSignal('outboundCalls24h', clampInt(Number(event.target.value), 0, 5000))}
                    className='mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs'
                  />
                </label>
                <label className='text-[11px] text-slate-700'>
                  ปลายทางไม่ซ้ำ 24 ชม.
                  <input
                    type='number'
                    min={0}
                    max={5000}
                    value={signals.distinctCallees24h ?? 0}
                    onChange={(event) => updateSignal('distinctCallees24h', clampInt(Number(event.target.value), 0, 5000))}
                    className='mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs'
                  />
                </label>
              </div>

              <button
                type='button'
                onClick={applyAutoSignalsFromDevice}
                disabled={!appScanResult && !deviceState}
                className='mt-2 inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 disabled:opacity-60'
              >
                <Smartphone className='h-3.5 w-3.5' /> ดึงสัญญาณอัตโนมัติจากผลสแกนเครื่อง
              </button>
            </div>

            <div className='mt-2 flex gap-2'>
              <button
                type='button'
                onClick={() => void runPhoneCheck()}
                disabled={phoneLoading || number.trim().length < 6}
                className='inline-flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-60'
              >
                <ShieldCheck className='h-3.5 w-3.5' /> {phoneLoading ? 'กำลังตรวจ...' : 'ตรวจเบอร์'}
              </button>
              <Link
                href='/risk-alerts'
                className='inline-flex h-9 items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-700'
              >
                <ShieldX className='h-3.5 w-3.5' /> บล็อก/รายงาน
              </Link>
            </div>
            {phoneResult ? (
              <div className='mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2'>
                <div className='flex items-center justify-between'>
                  <p className='text-xs font-semibold text-slate-800'>{phoneResult.number}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone(phoneResult.level)}`}>
                    {phoneResult.verdict} ({phoneResult.score})
                  </span>
                </div>
                <p className='mt-1 text-[11px] text-slate-600'>Signal score: {phoneResult.intelligence?.signalRiskScore ?? 0}</p>
                <ul className='mt-1 space-y-0.5 text-[11px] text-slate-600'>
                  {phoneResult.reasons.slice(0, 5).map((reason) => (
                    <li key={reason}>- {reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className='rounded-xl border border-slate-200 bg-white p-3'>
            <p className='text-sm font-semibold text-slate-900'>ตรวจลิงก์อันตราย / ฟิชชิง</p>
            <input
              type='url'
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              placeholder='วาง URL ที่ต้องการตรวจ'
              className='mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400'
            />
            <button
              type='button'
              onClick={() => void runUrlScan()}
              disabled={urlLoading || urlInput.trim().length < 8}
              className='mt-2 inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 disabled:opacity-60'
            >
              <Link2 className='h-3.5 w-3.5' /> {urlLoading ? 'กำลังตรวจ...' : 'ตรวจ URL'}
            </button>
            {urlError ? <p className='mt-2 text-xs text-rose-600'>{urlError}</p> : null}
            {urlResult ? (
              <div className='mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2'>
                <div className='flex items-center justify-between'>
                  <p className='text-xs font-semibold text-slate-800'>ผลสแกนลิงก์</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone(urlResult.level)}`}>
                    {urlResult.verdict} ({urlResult.score})
                  </span>
                </div>
                <p className='mt-1 text-[11px] text-slate-600'>
                  อายุโดเมน: {urlResult.domainAgeDays === null ? 'ไม่ทราบ' : `${urlResult.domainAgeDays} วัน`}
                </p>
                <ul className='mt-1 space-y-0.5 text-[11px] text-slate-600'>
                  {urlResult.indicators.slice(0, 3).map((indicator) => (
                    <li key={indicator}>- {indicator}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className='mt-3 grid gap-3 md:grid-cols-2'>
          <div className='rounded-xl border border-slate-200 bg-white p-3'>
            <p className='text-sm font-semibold text-slate-900'>สแกนไฟล์ APK / ไฟล์ดาวน์โหลด</p>
            <input
              type='file'
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              className='mt-2 block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:px-2 file:py-1'
            />
            <button
              type='button'
              onClick={() => void runFileScan()}
              disabled={fileLoading || !selectedFile}
              className='mt-2 inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 disabled:opacity-60'
            >
              <FileSearch className='h-3.5 w-3.5' /> {fileLoading ? 'กำลังตรวจ...' : 'สแกนไฟล์'}
            </button>
            {fileError ? <p className='mt-2 text-xs text-rose-600'>{fileError}</p> : null}
            {fileResult ? (
              <div className='mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-xs font-semibold text-slate-800'>ผลสแกนไฟล์</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone(fileResult.level)}`}>
                    {fileResult.verdict} ({fileResult.score})
                  </span>
                </div>
                <p className='mt-1 break-all text-[11px] text-slate-600'>SHA-256: {fileResult.sha256}</p>
                <ul className='mt-1 space-y-0.5 text-[11px] text-slate-600'>
                  {fileResult.indicators.slice(0, 3).map((indicator) => (
                    <li key={indicator}>- {indicator}</li>
                  ))}
                </ul>
                {fileResult.permissionInspection === 'not_available' ? (
                  <p className='mt-1 text-[11px] text-amber-700'>หมายเหตุ: การอ่าน permission ภายใน APK ต้องใช้ parser ฝั่ง native เพิ่มเติม</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className='rounded-xl border border-slate-200 bg-white p-3'>
            <div className='flex items-start justify-between gap-2'>
              <p className='text-sm font-semibold text-slate-900'>ตรวจแอปน่าสงสัยจากเครื่อง</p>
              <span className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600'>
                {isAndroidNative ? 'Android APK' : 'PWA จำกัดสิทธิ์'}
              </span>
            </div>
            <button
              type='button'
              onClick={() => void runAppScan()}
              disabled={appScanLoading}
              className='mt-2 inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 disabled:opacity-60'
            >
              <Smartphone className='h-3.5 w-3.5' /> {appScanLoading ? 'กำลังสแกนแอป...' : 'สแกนแอปที่ติดตั้ง'}
            </button>
            {appScanError ? <p className='mt-2 text-xs text-rose-600'>{appScanError}</p> : null}
            {deviceState ? (
              <div className='mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600'>
                <p>Play Protect: {deviceState.playProtectEnabled ? 'เปิด' : 'ปิด'}</p>
                <p>Security Patch: {deviceState.securityPatchLevel || 'ไม่ทราบ'}</p>
                <p>Unknown sources (สำหรับ Vault): {deviceState.unknownSourcesEnabled ? 'เปิด' : 'ปิด'}</p>
                <p>
                  Developer options / ADB: {deviceState.developerOptionsEnabled ? 'เปิด' : 'ปิด'} / {deviceState.adbEnabled ? 'เปิด' : 'ปิด'}
                </p>
              </div>
            ) : null}
            {appScanResult ? (
              <div className='mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2'>
                <p className='text-[11px] font-semibold text-slate-700'>
                  สแกนแล้ว {appScanResult.count} แอป, พบเสี่ยง/ควรถอน {highRiskApps.length} แอป
                </p>
                <div className='mt-1 space-y-1'>
                  {topRiskApps.map((app) => (
                    <div key={app.packageName} className='rounded-md border border-slate-200 bg-white px-2 py-1'>
                      <div className='flex items-center justify-between gap-2'>
                        <p className='truncate text-[11px] font-semibold text-slate-700'>{app.appName}</p>
                        <span
                          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                            app.riskLevel === 'safe'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : app.riskLevel === 'review'
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-rose-200 bg-rose-50 text-rose-700'
                          }`}
                        >
                          {appLevelLabel(app.riskLevel)} ({app.riskScore})
                        </span>
                      </div>
                      <p className='truncate text-[10px] text-slate-500'>{app.packageName}</p>
                      <p className='text-[10px] text-slate-500'>Network: {bytesLabel(app.networkRxBytes + app.networkTxBytes)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <p className='mt-3 inline-flex items-start gap-1 text-xs text-slate-500'>
          <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          ความโปร่งใส: ระบบนี้ช่วยวิเคราะห์ความเสี่ยง แต่ไม่สามารถสแกนมัลแวร์ได้ครบ 100% ทุกกรณี ต้องใช้ร่วมกับการยืนยันจากผู้ใช้และนโยบายองค์กร
        </p>
      </div>
    </section>
  );
}
