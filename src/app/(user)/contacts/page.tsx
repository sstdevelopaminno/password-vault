'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Phone, Search, UserRound } from 'lucide-react';
import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';
import { readMobileContacts, type MobileContact, type MobileContactsPermission } from '@/lib/mobile-contacts';

type Contact = MobileContact;

export default function ContactsPage() {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [permission, setPermission] = useState<MobileContactsPermission>('unknown');
  const [source, setSource] = useState<'device' | 'server-seed' | 'web'>('server-seed');
  const [loading, setLoading] = useState(false);
  const runtime = useMemo(() => detectRuntimeCapabilities(), []);
  const canRequestNativeContacts = runtime.isCapacitorNative && runtime.isAndroid;

  async function loadContacts(requestPermission: boolean) {
    setLoading(true);
    try {
      const result = await readMobileContacts({ requestPermission, limit: 500 });
      setContacts(result.contacts);
      setPermission(result.permission);
      setSource(result.source);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContacts(false);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((item) => item.name.toLowerCase().includes(q) || item.number.includes(q));
  }, [contacts, query]);

  return (
    <section className='space-y-3'>
      <div className='rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm'>
        <h1 className='text-lg font-semibold text-slate-900'>หน้าผู้ติดต่อ</h1>
        <p className='mt-1 text-sm text-slate-600'>รายชื่อมือถือสำหรับโทรออกอย่างปลอดภัย</p>
        <p className='mt-1 text-xs text-slate-500'>
          แหล่งข้อมูล: {source === 'device' ? 'รายชื่อจากเครื่องจริง' : source === 'web' ? 'Web runtime (ไม่รองรับรายชื่อเครื่อง)' : 'ข้อมูลเซิร์ฟเวอร์'}
        </p>

        {canRequestNativeContacts ? (
          <div className='mt-3 flex items-center gap-2'>
            <button
              type='button'
              onClick={() => void loadContacts(true)}
              disabled={loading}
              className='inline-flex h-9 items-center rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-60'
            >
              {loading ? 'กำลังโหลดรายชื่อ...' : 'ขอสิทธิ์รายชื่อจากมือถือ'}
            </button>
            <span className='text-xs text-slate-500'>สถานะสิทธิ์: {permission}</span>
          </div>
        ) : null}

        <div className='mt-3 flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500'>
          <Search className='h-4 w-4' />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='ค้นหาชื่อหรือเบอร์'
            className='h-full w-full bg-transparent outline-none'
          />
        </div>

        <div className='mt-3 space-y-2'>
          {loading ? <p className='text-sm text-slate-500'>กำลังซิงก์รายชื่อ...</p> : null}
          {filtered.map((item) => (
            <div key={item.id} className='flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2'>
              <div>
                <p className='text-sm font-semibold text-slate-900'>{item.name}</p>
                <p className='text-xs text-slate-500'>{item.number}</p>
              </div>
              <Link href={`/dialer?number=${encodeURIComponent(item.number)}`} className='inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-semibold text-white'>
                <Phone className='h-3.5 w-3.5' /> โทร
              </Link>
            </div>
          ))}
          {filtered.length === 0 ? <p className='text-sm text-slate-500'>ไม่พบข้อมูลผู้ติดต่อ</p> : null}
        </div>

        <Link href='/phone-profile?number=091-998-7788' className='mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600'>
          <UserRound className='h-4 w-4' /> เปิดหน้าโปรไฟล์เบอร์
        </Link>
      </div>
    </section>
  );
}
