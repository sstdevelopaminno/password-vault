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

function defaultTitle(locale: 'th' | 'en') {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return locale === 'th' ? 'โน้ตสแกน ' + now : 'Scanned Note ' + now;
}

export default function DocumentScannerPage() {
  const { locale, t } = useI18n();
  const { showToast } = useToast();
  const isThai = locale === 'th';

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>('tha+eng');
  const [title, setTitle] = useState(() => defaultTitle(locale));
  const [content, setContent] = useState('');
  const [progress, setProgress] = useState(0);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [saving, setSaving] = useState(false);

  const contentStats = useMemo(() => {
    const safe = content.trim();
    return { chars: safe.length, words: safe ? safe.split(/\s+/).length : 0 };
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
        setContent((prev) => (prev.trim() ? prev.trimEnd() + '\n\n' + text : text));
        if (!title.trim()) setTitle(defaultTitle(locale));
        showToast(t('scanner.toastScanSuccess'), 'success');
      } catch {
        showToast(t('scanner.toastScanFailed'), 'error');
      } finally {
        setOcrRunning(false);
        setProgress(0);
      }
    },
    [locale, ocrLanguage, showToast, t, title],
  );

  const translateContent = useCallback(async () => {
    if (!content.trim()) {
      showToast(t('scanner.toastNoContentToTranslate'), 'error');
      return;
    }
    setTranslating(true);
    try {
      const response = await fetch('/api/notes/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: content.trim(),
          mode: ocrLanguage,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; text?: string };
      if (!response.ok || !body.text) {
        showToast(body.error || t('scanner.toastTranslateFailed'), 'error');
        return;
      }
      setContent(body.text.trim());
      showToast(t('scanner.toastTranslateSuccess'), 'success');
    } catch {
      showToast(t('scanner.toastTranslateFailed'), 'error');
    } finally {
      setTranslating(false);
    }
  }, [content, ocrLanguage, showToast, t]);

  const saveAsNote = useCallback(async () => {
    const safeTitle = title.trim();
    const safeContent = content.trim();
    if (!safeTitle) {
      showToast(t('scanner.toastTitleRequired'), 'error');
      return;
    }
    if (!safeContent) {
      showToast(t('scanner.toastNoContent'), 'error');
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
        showToast(body.error || t('scanner.toastSaveFailed'), 'error');
        return;
      }
      showToast(t('scanner.toastSaveSuccess'), 'success');
      setTitle(defaultTitle(locale));
      setContent('');
    } catch {
      showToast(t('scanner.toastSaveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }, [content, locale, showToast, t, title]);

  const clearAll = useCallback(() => {
    setTitle(defaultTitle(locale));
    setContent('');
    setProgress(0);
  }, [locale]);

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
              <h1 className='text-app-h3 font-semibold text-slate-100'>{t('scanner.title')}</h1>
              <p className='text-app-caption text-slate-300'>{t('scanner.subtitle')}</p>
            </div>
          </div>
          <Button type='button' variant='secondary' size='sm' className='h-9 rounded-xl px-3 text-app-caption' onClick={clearAll} disabled={ocrRunning || translating || saving}>
            {t('scanner.clear')}
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
                disabled={ocrRunning || translating}
                onClick={() => setOcrLanguage(option.code)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <input ref={inputRef} type='file' accept='image/*' capture='environment' className='hidden' onChange={handleScanImage} />
          <Button
            type='button'
            variant='secondary'
            className='h-9 rounded-full border border-[rgba(138,174,255,0.42)] bg-[rgba(24,45,105,0.84)] px-3.5 text-app-caption'
            onClick={openPicker}
            disabled={ocrRunning || translating || saving}
          >
            {ocrRunning ? <Loader2 className='mr-1 h-4 w-4 animate-spin' /> : <ImagePlus className='mr-1 h-4 w-4' />}
            {t('scanner.runOcr')}
          </Button>
          <Button
            type='button'
            variant='secondary'
            className='h-9 rounded-full border border-[rgba(138,174,255,0.42)] bg-[rgba(24,45,105,0.84)] px-3.5 text-app-caption'
            onClick={() => void translateContent()}
            disabled={ocrRunning || translating || saving}
          >
            {translating ? <Loader2 className='mr-1 h-4 w-4 animate-spin' /> : <Languages className='mr-1 h-4 w-4' />}
            {translating ? t('scanner.translating') : t('scanner.translate')}
          </Button>
        </div>

        {ocrRunning ? (
          <div className='mt-3 rounded-xl border border-cyan-300/40 bg-[rgba(31,95,153,0.3)] p-2.5'>
            <p className='text-app-caption text-cyan-100'>{t('scanner.scanning')}</p>
            <div className='mt-2 h-1.5 w-full rounded-full bg-[rgba(144,211,255,0.26)]'>
              <div className='h-full rounded-full bg-[linear-gradient(90deg,#34d8ff,#6d8dff)] transition-all duration-200' style={{ width: Math.max(6, Math.round(progress * 100)) + '%' }} />
            </div>
          </div>
        ) : null}
      </div>

      <div className='neon-panel rounded-[24px] p-4'>
        <label className='form-label text-slate-200'>{t('scanner.noteTitle')}</label>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={140}
          className='mt-1 h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(16,30,74,0.75)] px-3 text-app-body text-slate-100 outline-none focus:border-[var(--border-strong)]'
          placeholder={t('scanner.noteTitlePlaceholder')}
        />

        <label className='mt-3 block form-label text-slate-200'>{t('scanner.extractedText')}</label>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className='mt-1 min-h-[260px] w-full resize-y rounded-2xl border border-[var(--border-soft)] bg-[rgba(16,30,74,0.75)] px-3 py-3 text-app-body text-slate-100 outline-none focus:border-[var(--border-strong)]'
          placeholder={t('scanner.extractedPlaceholder')}
        />

        <div className='mt-2 flex flex-wrap items-center justify-between gap-2 text-app-micro text-slate-300'>
          <p>{t('scanner.noteLimit')}</p>
          <p>
            {t('scanner.words')} {contentStats.words} | {t('scanner.chars')} {contentStats.chars}
          </p>
        </div>

        <div className='mt-3 grid grid-cols-2 gap-2'>
          <Button type='button' variant='secondary' className='h-11 w-full rounded-xl' onClick={clearAll} disabled={ocrRunning || translating || saving}>
            <FileText className='mr-1 h-4 w-4' />
            {t('scanner.newDocument')}
          </Button>
          <Button type='button' className='h-11 w-full rounded-xl' onClick={() => void saveAsNote()} disabled={ocrRunning || translating || saving}>
            {saving ? <Loader2 className='mr-1 h-4 w-4 animate-spin' /> : <Save className='mr-1 h-4 w-4' />}
            {saving ? t('scanner.saving') : t('scanner.saveAsNote')}
          </Button>
        </div>
      </div>
    </section>
  );
}

