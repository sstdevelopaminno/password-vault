'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Phone,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';
import {
  readVaultShieldDeviceContacts,
  requestVaultShieldContactsPermission,
  type VaultShieldDeviceContact,
} from '@/lib/vault-shield';

type PrivateContact = {
  id: string;
  name: string;
  number: string;
  source: 'manual' | 'device';
  createdAt: string;
  deviceContactId?: string;
};

const PRIVATE_CONTACTS_STORAGE_KEY = 'pv_private_contacts_v1';
const DEVICE_CONTACTS_LIMIT = 500;
const CONTACTS_PER_PAGE = 8;

function normalizePhoneNumber(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[()\-\s]/g, '')
    .replace(/[^\d+]/g, '');
}

function fingerprintContact(name: string, number: string) {
  return name.trim().toLowerCase() + '|' + normalizePhoneNumber(number);
}

function mergePrivateContacts(current: PrivateContact[], incoming: PrivateContact[]) {
  const seen = new Set(current.map((item) => fingerprintContact(item.name, item.number)));
  const next = [...current];
  for (const contact of incoming) {
    const key = fingerprintContact(contact.name, contact.number);
    if (seen.has(key)) continue;
    seen.add(key);
    next.unshift(contact);
  }
  return next;
}

function sanitizeDeviceContacts(input: VaultShieldDeviceContact[]) {
  const unique = new Map<string, VaultShieldDeviceContact>();
  for (const contact of input) {
    const name = String(contact.name ?? '').trim();
    const number = normalizePhoneNumber(String(contact.number ?? ''));
    if (!name || !number) continue;
    const key = name.toLowerCase() + '|' + number;
    if (!unique.has(key)) {
      unique.set(key, { ...contact, name, number });
    }
  }
  return Array.from(unique.values());
}

type SavePopupState = 'hidden' | 'saving' | 'success';

export default function PrivateContactsPage() {
  const { showToast } = useToast();
  const runtime = useMemo(() => detectRuntimeCapabilities(), []);
  const canReadDeviceContacts = runtime.isCapacitorNative && runtime.isAndroid;

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [savePopupState, setSavePopupState] = useState<SavePopupState>('hidden');

  const [privateContacts, setPrivateContacts] = useState<PrivateContact[]>([]);
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);
  const [contactsPage, setContactsPage] = useState(1);

  const [deviceContacts, setDeviceContacts] = useState<VaultShieldDeviceContact[]>([]);
  const [selectedDeviceContactIds, setSelectedDeviceContactIds] = useState<string[]>([]);
  const [loadingDeviceContacts, setLoadingDeviceContacts] = useState(false);
  const [permissionState, setPermissionState] = useState<'idle' | 'granted' | 'denied' | 'denied_permanently' | 'unknown'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(PRIVATE_CONTACTS_STORAGE_KEY);
      if (!raw) {
        setLoadedFromStorage(true);
        return;
      }
      const parsed = JSON.parse(raw) as PrivateContact[] | null;
      if (Array.isArray(parsed)) {
        setPrivateContacts(
          parsed
            .filter((item) => item && item.name && item.number)
            .map((item) => ({
              id: String(item.id ?? crypto.randomUUID()),
              name: String(item.name),
              number: String(item.number),
              source: item.source === 'device' ? 'device' : 'manual',
              createdAt: String(item.createdAt ?? new Date().toISOString()),
              deviceContactId: item.deviceContactId ? String(item.deviceContactId) : undefined,
            })),
        );
      }
    } catch {
      // ignore invalid local storage data
    } finally {
      setLoadedFromStorage(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !loadedFromStorage) return;
    try {
      window.localStorage.setItem(PRIVATE_CONTACTS_STORAGE_KEY, JSON.stringify(privateContacts));
    } catch {
      // ignore write failure
    }
  }, [loadedFromStorage, privateContacts]);

  const totalContactPages = useMemo(
    () => Math.max(1, Math.ceil(privateContacts.length / CONTACTS_PER_PAGE)),
    [privateContacts.length],
  );

  const pagedPrivateContacts = useMemo(() => {
    const start = (contactsPage - 1) * CONTACTS_PER_PAGE;
    return privateContacts.slice(start, start + CONTACTS_PER_PAGE);
  }, [contactsPage, privateContacts]);

  useEffect(() => {
    setContactsPage((prev) => Math.min(prev, totalContactPages));
  }, [totalContactPages]);

  function resetManualForm() {
    setManualName('');
    setManualNumber('');
  }

  async function handleAddManualContact() {
    const name = manualName.trim();
    const number = normalizePhoneNumber(manualNumber);
    if (!name || !number) {
      showToast('กรุณากรอกชื่อและหมายเลขให้ครบ', 'error');
      return;
    }

    setSavePopupState('saving');
    await new Promise((resolve) => window.setTimeout(resolve, 420));

    const newContact: PrivateContact = {
      id: crypto.randomUUID(),
      name,
      number,
      source: 'manual',
      createdAt: new Date().toISOString(),
    };

    setPrivateContacts((prev) => mergePrivateContacts(prev, [newContact]));
    setSavePopupState('success');

    window.setTimeout(() => {
      setSavePopupState('hidden');
      setIsManualModalOpen(false);
      resetManualForm();
    }, 820);
  }

  async function handleLoadDeviceContacts() {
    if (!canReadDeviceContacts) {
      setPermissionState('unknown');
      showToast('การอ่านรายชื่อจากมือถือรองรับเฉพาะ Android Native App', 'error');
      return;
    }

    setLoadingDeviceContacts(true);
    try {
      const permission = await requestVaultShieldContactsPermission();
      setPermissionState(permission);
      if (permission !== 'granted') {
        showToast('ยังไม่ได้รับสิทธิ์อ่านรายชื่อในมือถือ', 'error');
        return;
      }

      const result = await readVaultShieldDeviceContacts(DEVICE_CONTACTS_LIMIT);
      const rows = Array.isArray(result?.contacts) ? sanitizeDeviceContacts(result.contacts) : [];
      setDeviceContacts(rows);
      setSelectedDeviceContactIds([]);

      if (rows.length === 0) {
        showToast('ไม่พบรายชื่อในมือถือ', 'error');
      } else {
        showToast('โหลดรายชื่อจากมือถือแล้ว');
      }
    } finally {
      setLoadingDeviceContacts(false);
    }
  }

  function toggleSelectDeviceContact(id: string) {
    setSelectedDeviceContactIds((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id);
      return [...prev, id];
    });
  }

  function addContactsFromDevice(importAll: boolean) {
    const source = importAll ? deviceContacts : deviceContacts.filter((item) => selectedDeviceContactIds.includes(item.id));
    if (source.length === 0) {
      showToast('ยังไม่ได้เลือกรายชื่อ', 'error');
      return;
    }

    const mapped = source.map((item) => ({
      id: crypto.randomUUID(),
      name: item.name.trim(),
      number: normalizePhoneNumber(item.number),
      source: 'device' as const,
      createdAt: new Date().toISOString(),
      deviceContactId: item.id,
    }));

    setPrivateContacts((prev) => mergePrivateContacts(prev, mapped));
    setSelectedDeviceContactIds([]);
    showToast(importAll ? 'ดึงรายชื่อทั้งหมดเข้าเบอร์โทรลับแล้ว' : 'เพิ่มรายชื่อที่เลือกเข้าเบอร์โทรลับแล้ว');
  }

  function handleDeletePrivateContact(id: string) {
    setPrivateContacts((prev) => prev.filter((item) => item.id !== id));
    showToast('ลบรายการแล้ว');
  }

  function handleDeleteAllPrivateContacts() {
    if (privateContacts.length === 0) return;
    const ok = window.confirm('ยืนยันลบเบอร์โทรลับทั้งหมด?');
    if (!ok) return;
    setPrivateContacts([]);
    setContactsPage(1);
    showToast('ลบรายการทั้งหมดแล้ว');
  }

  function handleCallContact(number: string) {
    if (!number || typeof window === 'undefined') return;
    window.location.href = 'tel:' + number;
  }

  return (
    <section className='space-y-3 pb-20 pt-[max(10px,env(safe-area-inset-top))]'>
      <Card className='space-y-3 rounded-2xl border-slate-200 bg-white p-4'>
        <div className='flex items-start gap-3'>
          <div className='inline-flex rounded-xl bg-blue-50 p-2 text-blue-600'>
            <Phone className='h-5 w-5' />
          </div>
          <div className='min-w-0'>
            <h1 className='text-app-h3 font-semibold text-slate-900'>เบอร์โทรลับ</h1>
            <p className='text-app-caption text-slate-500'>เก็บเบอร์ที่ต้องการไว้แบบส่วนตัวในแอป โดยไม่แก้ไขรายชื่อในมือถือ</p>
          </div>
        </div>

        <div className='rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-app-caption text-emerald-800'>
          <div className='inline-flex items-center gap-1.5 font-semibold'>
            <ShieldCheck className='h-4 w-4' />
            รายการที่บันทึกที่นี่จะแยกจากสมุดโทรศัพท์มือถือ
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <Button type='button' variant='secondary' className='h-10 w-full justify-center gap-2' onClick={() => setIsManualModalOpen(true)}>
            <UserPlus className='h-4 w-4' />
            เพิ่มรายการใหม่
          </Button>
          <Button type='button' className='h-10 w-full justify-center gap-2' onClick={handleLoadDeviceContacts} disabled={loadingDeviceContacts}>
            {loadingDeviceContacts ? <Loader2 className='h-4 w-4 animate-spin' /> : <Users className='h-4 w-4' />}
            ดูรายชื่อในมือถือ
          </Button>
        </div>
      </Card>

      {permissionState !== 'idle' && permissionState !== 'granted' ? (
        <Card className='rounded-2xl border-amber-200 bg-amber-50 p-3 text-app-caption text-amber-800'>
          <div className='inline-flex items-center gap-1.5 font-semibold'>
            <AlertCircle className='h-4 w-4' />
            ยังไม่สามารถอ่านรายชื่อในมือถือ ({permissionState})
          </div>
        </Card>
      ) : null}

      {deviceContacts.length > 0 ? (
        <Card className='space-y-3 rounded-2xl border-slate-200 bg-white p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h2 className='text-app-body font-semibold text-slate-900'>รายชื่อจากมือถือ ({deviceContacts.length})</h2>
            <p className='text-app-caption text-slate-500'>เลือกบางรายการ หรือดึงทั้งหมด</p>
          </div>

          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setSelectedDeviceContactIds(deviceContacts.map((item) => item.id))}
            >
              เลือกทั้งหมด
            </Button>
            <Button type='button' size='sm' variant='secondary' onClick={() => addContactsFromDevice(false)}>
              เพิ่มรายการที่เลือก
            </Button>
            <Button type='button' size='sm' onClick={() => addContactsFromDevice(true)}>
              ดึงทั้งหมด
            </Button>
          </div>

          <div className='max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2'>
            {deviceContacts.map((item) => (
              <label key={item.id} className='flex cursor-pointer items-center justify-between rounded-lg bg-white px-3 py-2 text-app-body text-slate-700'>
                <div className='min-w-0'>
                  <p className='truncate font-semibold text-slate-900'>{item.name}</p>
                  <p className='text-app-caption text-slate-500'>{normalizePhoneNumber(item.number)}</p>
                </div>
                <input
                  type='checkbox'
                  className='h-4 w-4 rounded border-slate-300'
                  checked={selectedDeviceContactIds.includes(item.id)}
                  onChange={() => toggleSelectDeviceContact(item.id)}
                />
              </label>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className='space-y-3 rounded-2xl border-slate-200 bg-white p-4'>
        <div className='flex items-center justify-between gap-2'>
          <h2 className='text-app-body font-semibold text-slate-900'>รายการเบอร์โทรลับ ({privateContacts.length})</h2>
          {privateContacts.length > 0 ? (
            <Button type='button' variant='secondary' size='sm' className='h-8 px-2.5 text-app-caption' onClick={handleDeleteAllPrivateContacts}>
              <Trash2 className='h-3.5 w-3.5' />
              ลบทั้งหมด
            </Button>
          ) : null}
        </div>

        {!loadedFromStorage ? (
          <div className='flex items-center gap-2 text-app-body text-slate-500'>
            <Loader2 className='h-4 w-4 animate-spin' />
            กำลังโหลดรายการ...
          </div>
        ) : privateContacts.length === 0 ? (
          <div className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center'>
            <div className='mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white shadow-[0_8px_18px_rgba(79,123,255,0.28)]'>
              <Sparkles className='h-5 w-5' />
            </div>
            <p className='text-app-body font-semibold text-slate-900'>ยังไม่มีรายการเบอร์โทรลับ</p>
            <p className='text-app-caption text-slate-500'>กดปุ่มเพิ่มรายการใหม่ หรือดึงจากรายชื่อมือถือได้ทันที</p>
          </div>
        ) : (
          <div className='space-y-2'>
            {pagedPrivateContacts.map((item) => (
              <div key={item.id} className='flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
                <div className='min-w-0'>
                  <p className='truncate text-app-body font-semibold text-slate-900'>{item.name}</p>
                  <p className='break-all text-app-caption text-slate-600'>{item.number}</p>
                  <p className='text-app-micro text-slate-500'>{item.source === 'device' ? 'เพิ่มจากรายชื่อมือถือ' : 'เพิ่มด้วยตนเอง'}</p>
                </div>
                <div className='flex shrink-0 items-center gap-1.5'>
                  <Button type='button' variant='secondary' size='sm' className='h-8 gap-1 px-2 text-app-caption' onClick={() => handleDeletePrivateContact(item.id)}>
                    <Trash2 className='h-3.5 w-3.5' />
                    ลบ
                  </Button>
                  <Button type='button' size='sm' className='h-8 gap-1 px-2 text-app-caption' onClick={() => handleCallContact(item.number)}>
                    <Phone className='h-3.5 w-3.5' />
                    โทร
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {privateContacts.length > CONTACTS_PER_PAGE ? (
          <div className='flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2'>
            <Button type='button' variant='secondary' size='sm' className='h-8 px-2' onClick={() => setContactsPage((prev) => Math.max(1, prev - 1))} disabled={contactsPage === 1}>
              <ChevronLeft className='h-3.5 w-3.5' />
              ก่อนหน้า
            </Button>
            <p className='text-app-caption font-semibold text-slate-600'>
              หน้า {contactsPage} / {totalContactPages}
            </p>
            <Button type='button' variant='secondary' size='sm' className='h-8 px-2' onClick={() => setContactsPage((prev) => Math.min(totalContactPages, prev + 1))} disabled={contactsPage === totalContactPages}>
              ถัดไป
              <ChevronRight className='h-3.5 w-3.5' />
            </Button>
          </div>
        ) : null}
      </Card>

      {isManualModalOpen ? (
        <div className='fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/32 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-20 backdrop-blur-[1px] animate-overlay-in sm:items-center'>
          <div className='w-full max-w-md rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_22px_52px_rgba(15,23,42,0.34)] animate-modal-pop-in'>
            <h2 className='text-app-h3 font-semibold text-slate-900'>เพิ่มรายการใหม่</h2>
            <div className='mt-3 space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-3'>
              <p className='text-app-micro font-semibold uppercase tracking-[0.08em] text-slate-500'>ข้อมูลติดต่อ</p>
              <Input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder='ชื่อรายการ' className='h-10 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:ring-blue-100' />
              <Input value={manualNumber} onChange={(event) => setManualNumber(event.target.value)} placeholder='หมายเลขโทรศัพท์' inputMode='tel' className='h-10 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:ring-blue-100' />
            </div>
            <div className='mt-3 grid grid-cols-2 gap-2'>
              <Button type='button' variant='secondary' className='h-10 w-full' onClick={() => { setIsManualModalOpen(false); resetManualForm(); }}>
                ยกเลิก
              </Button>
              <Button type='button' className='h-10 w-full' onClick={handleAddManualContact}>
                บันทึกรายการ
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {savePopupState !== 'hidden' ? (
        <div className='fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/35 px-6 backdrop-blur-[1.5px] animate-overlay-in'>
          <div className='w-full max-w-[290px] rounded-3xl border border-slate-200 bg-white px-5 py-6 text-center shadow-[0_24px_56px_rgba(15,23,42,0.32)] animate-modal-pop-in'>
            <div className='mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-fuchsia-500 text-white'>
              {savePopupState === 'saving' ? <Loader2 className='h-6 w-6 animate-spin' /> : <CheckCircle2 className='h-6 w-6' />}
            </div>
            <p className='text-app-body font-semibold text-slate-900'>
              {savePopupState === 'saving' ? 'กำลังบันทึกรายการ...' : 'บันทึกสำเร็จแล้ว'}
            </p>
            <p className='mt-1 text-app-caption text-slate-500'>
              {savePopupState === 'saving' ? 'กรุณารอสักครู่' : 'เพิ่มเบอร์โทรลับเรียบร้อย'}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
