'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { FileText, ImagePlus, Languages, Loader2, Save, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/provider';
import { useToast } from '@/components/ui/toast';
import { disposeOcrWorker, recognizeImageWithOcr } from '@/lib/ocr-worker';

type OcrLanguage = 'tha+eng' | 'tha' | 'eng';

const OCR_LANG_OPTIONS: Array<{ code: OcrLanguage; label: string }> = [
  { code: 'tha+eng', label: 'TH+EN' },
  { code: 'tha', label: 'TH' },
  { code: 'eng', label: 'EN' },
];

function defaultTitle() {
  const now = new Date();
  return 'Scanned Note ' + now.toISOString().slice(0, 16).replace('T', ' ');
}

export default function DocumentScannerPage() {
  const { locale } = useI18n();
  const { showToast } = useToast();
  const isThai = locale === 'th';

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>('tha+eng');
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState('');
  const [progress, setProgress] = useState(0);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const contentStats = useMemo(() => {
    const safe = content.trim();
    const chars = safe.length;
    const words = safe ? safe.split(/\s+/).length : 0;
    return { chars, words };
  }, [content]);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleScanImage = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      setOcrRunning(true);
      setProgress(0);
      try {
        const text = await recognizeImageWithOcr({
          file,
          language: ocrLanguage,
          onProgress: (value) => setProgress(value),
        });
        setContent((prev) => {
          if (!prev.trim()) return text;
          return prev.trimEnd() + '\n\n' + text;
        });
        if (!title.trim()) setTitle(defaultTitle());
        showToast(isThai ? 'สแกนเอกสารสำเร็จ' : 'Document scanned', 'success');
      } catch {
        showToast(isThai ? 'สแกนเอกสารไม่สำเร็จ' : 'Document scan failed', 'error');
      } finally {
        setOcrRunning(false);
        setProgress(0);
      }
    },
    [isThai, ocrLanguage, showToast],
  );

  const saveAsNote = useCallback(async () => {
    const safeTitle = title.trim();
    const safeContent = content.trim();
    if (!safeTitle) {
      showToast(isThai ? 'กรุณาใส่ชื่อโน้ต' : 'Please enter a note title', 'error');
      return;
    }
    if (!safeContent) {
      showToast(isThai ? 'ยังไม่มีข้อความจากการสแกน' : 'No scanned text yet', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: safeTitle.slice(0, 140),
          content: safeContent.slice(0, 20000),
          reminderAt: null,
          meetingAt: null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        showToast(body.error || (isThai ? 'บันทึกโน้ตไม่สำเร็จ' : 'Failed to save note'), 'error');
        return;
      }
      showToast(isThai ? 'บันทึกเข้าโน้ตเรียบร้อย' : 'Saved to notes', 'success');
      setTitle(defaultTitle());
      setContent('');
    } catch {
      showToast(isThai ? 'บันทึกโน้ตไม่สำเร็จ' : 'Failed to save note', 'error');
    } finally {
      setSaving(false);
    }
  }, [content, isThai, showToast, title]);

  const clearAll = useCallback(() => {
    setTitle(defaultTitle());
    setContent('');
    setProgress(0);
  }, []);

  const disposeWorkers = useCallback(() => {
    void disposeOcrWorker('tha+eng');
    void disposeOcrWorker('tha');
    void disposeOcrWorker('eng');
  }, []);

  useEffect(() => {
    return () => {
      disposeWorkers();
    };
  }, [disposeWorkers]);

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <div className='neon-panel rounded-[24px] p-4'>
        <div className='flex items-center justify-between gap-2'>
          <div className='inline-flex items-center gap-2'>
            <span className='neon-icon-wrap inline-flex h-10 w-10 items-center justify-center rounded-2xl'>
              <ScanText className='h-5 w-5 text-slate-100' />
            </span>
            <div>
              <h1 className='text-app-h3 font-semibold text-slate-100'>{isThai ? 'สแกนเอกสาร' : 'Document Scanner'}</h1>
              <p className='text-app-caption text-slate-300'>{isThai ? 'สแกนเสร็จแล้วบันทึกเป็นโน้ตได้ทันที' : 'Scan and save directly into notes.'}</p>
            </div>
          </div>
          <Button type='button' variant='secondary' size='sm' className='h-9 rounded-xl px-3 text-app-caption' onClick={clearAll} disabled={ocrRunning || saving}>
            {isThai ? 'ล้างทั้งหมด' : 'Clear'}
          </Button>
        </div>

        <div className='mt-3 flex flex-wrap items-center gap-2'>
          <div className='inline-flex rounded-xl border border-[var(--border-soft)] bg-[rgba(18,34,84,0.7)] p-1'>
            {OCR_LANG_OPTIONS.map((option) => (
              <button
                key={option.code}
                type='button'
                className={
                  'rounded-lg px-2.5 py-1 text-app-micro font-semibold transition ' +
                  (ocrLanguage === option.code ? 'bg-[rgba(77,137,255,0.8)] text-slate-100' : 'text-slate-300 hover:bg-[rgba(94,137,255,0.24)]')
                }
                disabled={ocrRunning}
                onClick={() => setOcrLanguage(option.code)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <input ref={inputRef} type='file' accept='image/*' capture='environment' className='hidden' onChange={handleScanImage} />
          <Button type='button' className='h-10 rounded-xl px-3 text-app-caption' onClick={openPicker} disabled={ocrRunning || saving}>
            {ocrRunning ? <Loader2 className='mr-1 h-4 w-4 animate-spin' /> : <ImagePlus className='mr-1 h-4 w-4' />}
            {isThai ? 'เลือกภาพเพื่อสแกน' : 'Pick image to scan'}
          </Button>
          <Button type='button' variant='secondary' className='h-10 rounded-xl px-3 text-app-caption' onClick={disposeWorkers} disabled={ocrRunning}>
            <Languages className='mr-1 h-4 w-4' />
            {isThai ? 'คืนหน่วยความจำ OCR' : 'Release OCR memory'}
          </Button>
        </div>

        {ocrRunning ? (
          <div className='mt-3 rounded-xl border border-cyan-300/40 bg-[rgba(31,95,153,0.3)] p-2.5'>
            <p className='text-app-caption text-cyan-100'>{isThai ? 'กำลังสแกนข้อความจากภาพ...' : 'Scanning text from image...'}</p>
            <div className='mt-2 h-1.5 w-full rounded-full bg-[rgba(144,211,255,0.26)]'>
              <div className='h-full rounded-full bg-[linear-gradient(90deg,#34d8ff,#6d8dff)] transition-all duration-200' style={{ width: Math.max(6, Math.round(progress * 100)) + '%' }} />
            </div>
          </div>
        ) : null}
      </div>

      <div className='neon-panel rounded-[24px] p-4'>
        <label className='form-label text-slate-200'>{isThai ? 'ชื่อโน้ต' : 'Note title'}</label>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={140}
          className='mt-1 h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(16,30,74,0.75)] px-3 text-app-body text-slate-100 outline-none focus:border-[var(--border-strong)]'
          placeholder={isThai ? 'ตั้งชื่อโน้ตจากเอกสารที่สแกน' : 'Set a title for this scanned note'}
        />

        <label className='mt-3 block form-label text-slate-200'>{isThai ? 'ข้อความจากเอกสาร' : 'Extracted text'}</label>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className='mt-1 min-h-[260px] w-full resize-y rounded-2xl border border-[var(--border-soft)] bg-[rgba(16,30,74,0.75)] px-3 py-3 text-app-body text-slate-100 outline-none focus:border-[var(--border-strong)]'
          placeholder={isThai ? 'ผลการสแกนจะแสดงที่นี่ และแก้ไขก่อนบันทึกได้' : 'Scanned text appears here. You can edit before saving.'}
        />

        <div className='mt-2 flex flex-wrap items-center justify-between gap-2 text-app-micro text-slate-300'>
          <p>{isThai ? 'รองรับสูงสุด 20,000 ตัวอักษรต่อโน้ต' : 'Supports up to 20,000 characters per note.'}</p>
          <p>
            {isThai ? 'คำ' : 'Words'} {contentStats.words} | {isThai ? 'ตัวอักษร' : 'Chars'} {contentStats.chars}
          </p>
        </div>

        <div className='mt-3 grid grid-cols-2 gap-2'>
          <Button type='button' variant='secondary' className='h-11 w-full rounded-xl' onClick={clearAll} disabled={ocrRunning || saving}>
            <FileText className='mr-1 h-4 w-4' />
            {isThai ? 'เริ่มเอกสารใหม่' : 'New document'}
          </Button>
          <Button type='button' className='h-11 w-full rounded-xl' onClick={() => void saveAsNote()} disabled={ocrRunning || saving}>
            {saving ? <Loader2 className='mr-1 h-4 w-4 animate-spin' /> : <Save className='mr-1 h-4 w-4' />}
            {saving ? (isThai ? 'กำลังบันทึก...' : 'Saving...') : isThai ? 'บันทึกเป็นโน้ต' : 'Save as note'}
          </Button>
        </div>
      </div>
    </section>
  );
}
