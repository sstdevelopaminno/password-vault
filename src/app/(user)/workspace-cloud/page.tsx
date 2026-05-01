'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { CloudUpload, Download, File, FileArchive, FileImage, FileText, Loader2, Music2, RefreshCcw, Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n/provider';

type WorkspaceFileItem = {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  updatedAt: string;
  downloadUrl: string;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return value.toFixed(value >= 100 || index === 0 ? 0 : 1) + ' ' + units[index];
}

function chooseFileIcon(mimeType: string) {
  const normalized = String(mimeType ?? '').toLowerCase();
  if (normalized.startsWith('image/')) return FileImage;
  if (normalized.startsWith('audio/')) return Music2;
  if (normalized.startsWith('video/')) return Video;
  if (normalized.includes('zip') || normalized.includes('rar') || normalized.includes('tar') || normalized.includes('7z')) return FileArchive;
  if (normalized.includes('pdf') || normalized.includes('text') || normalized.includes('word') || normalized.includes('sheet') || normalized.includes('presentation')) return FileText;
  return File;
}

export default function WorkspaceCloudPage() {
  const { locale } = useI18n();
  const { showToast } = useToast();
  const isThai = locale === 'th';
  const [files, setFiles] = useState<WorkspaceFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState('');

  const fileCountLabel = useMemo(() => {
    if (isThai) return 'ไฟล์ทั้งหมด ' + String(files.length) + ' รายการ';
    return String(files.length) + ' files';
  }, [files.length, isThai]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/workspace-files', { cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as { error?: string; files?: WorkspaceFileItem[] };
      if (!response.ok) {
        showToast(body.error || (isThai ? 'โหลดไฟล์ไม่สำเร็จ' : 'Failed to load files'), 'error');
        setFiles([]);
        return;
      }
      setFiles(Array.isArray(body.files) ? body.files : []);
    } catch {
      showToast(isThai ? 'โหลดไฟล์ไม่สำเร็จ' : 'Failed to load files', 'error');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [isThai, showToast]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (selectedFiles.length === 0) return;

      setUploading(true);
      try {
        for (const file of selectedFiles) {
          const formData = new FormData();
          formData.append('file', file);
          const response = await fetch('/api/workspace-files', {
            method: 'POST',
            body: formData,
          });
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (!response.ok) {
            throw new Error(body.error || (isThai ? 'อัปโหลดไฟล์ไม่สำเร็จ' : 'Upload failed'));
          }
        }
        showToast(
          isThai
            ? 'อัปโหลดไฟล์เรียบร้อย ' + String(selectedFiles.length) + ' รายการ'
            : 'Uploaded ' + String(selectedFiles.length) + ' file(s) successfully',
          'success',
        );
        await loadFiles();
      } catch (error) {
        showToast(String(error instanceof Error ? error.message : isThai ? 'อัปโหลดไฟล์ไม่สำเร็จ' : 'Upload failed'), 'error');
      } finally {
        setUploading(false);
      }
    },
    [isThai, loadFiles, showToast],
  );

  const handleDelete = useCallback(
    async (target: WorkspaceFileItem) => {
      setDeletingPath(target.path);
      try {
        const response = await fetch('/api/workspace-files?path=' + encodeURIComponent(target.path), {
          method: 'DELETE',
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          showToast(body.error || (isThai ? 'ลบไฟล์ไม่สำเร็จ' : 'Failed to delete file'), 'error');
          return;
        }
        setFiles((prev) => prev.filter((item) => item.path !== target.path));
        showToast(isThai ? 'ลบไฟล์เรียบร้อย' : 'File deleted', 'success');
      } catch {
        showToast(isThai ? 'ลบไฟล์ไม่สำเร็จ' : 'Failed to delete file', 'error');
      } finally {
        setDeletingPath('');
      }
    },
    [isThai, showToast],
  );

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <div className='neon-panel rounded-[24px] p-4'>
        <div className='flex items-start justify-between gap-2'>
          <div>
            <h1 className='text-app-h3 font-semibold text-slate-100'>{isThai ? 'คลาวด์ไฟล์งาน' : 'Cloud Files'}</h1>
            <p className='mt-1 text-app-caption text-slate-300'>{fileCountLabel}</p>
          </div>
          <Button type='button' variant='secondary' size='sm' className='h-9 rounded-xl px-3 text-app-caption' onClick={() => void loadFiles()} disabled={loading || uploading}>
            {loading ? <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' /> : <RefreshCcw className='mr-1 h-3.5 w-3.5' />}
            {isThai ? 'รีเฟรช' : 'Refresh'}
          </Button>
        </div>

        <label className='mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgba(122,175,255,0.62)] bg-[rgba(22,42,104,0.52)] px-3 py-4 text-center transition hover:bg-[rgba(34,57,134,0.58)]'>
          <input type='file' multiple className='hidden' onChange={handleUpload} />
          {uploading ? <Loader2 className='h-4 w-4 animate-spin text-cyan-100' /> : <CloudUpload className='h-4 w-4 text-cyan-100' />}
          <span className='text-app-body font-semibold text-slate-100'>
            {uploading ? (isThai ? 'กำลังอัปโหลด...' : 'Uploading...') : isThai ? 'เลือกไฟล์เพื่ออัปโหลดขึ้นคลาวด์' : 'Select files to upload to cloud'}
          </span>
        </label>
        <p className='mt-2 text-app-micro text-slate-300'>
          {isThai ? 'รองรับไฟล์งานทั่วไป สูงสุด 25 MB ต่อไฟล์' : 'Supports common work files, up to 25 MB per file.'}
        </p>
      </div>

      <div className='space-y-2'>
        {loading && files.length === 0 ? (
          <div className='neon-soft-panel rounded-[18px] p-3 text-app-caption text-slate-200'>{isThai ? 'กำลังโหลดรายการไฟล์...' : 'Loading files...'}</div>
        ) : null}
        {!loading && files.length === 0 ? (
          <div className='neon-soft-panel rounded-[18px] p-4 text-center text-app-body text-slate-200'>
            {isThai ? 'ยังไม่มีไฟล์ในคลาวด์ เริ่มอัปโหลดไฟล์แรกได้เลย' : 'No cloud files yet. Upload your first file.'}
          </div>
        ) : null}
        {files.map((fileItem) => {
          const Icon = chooseFileIcon(fileItem.mimeType);
          const deleting = deletingPath === fileItem.path;
          return (
            <article key={fileItem.path} className='neon-soft-panel rounded-[18px] p-3'>
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <p className='flex items-center gap-2 text-app-body font-semibold text-slate-100'>
                    <Icon className='h-4 w-4 shrink-0' />
                    <span className='truncate'>{fileItem.name}</span>
                  </p>
                  <p className='mt-1 text-app-micro text-slate-300'>
                    {formatBytes(fileItem.size)} | {new Date(fileItem.updatedAt).toLocaleString(isThai ? 'th-TH' : 'en-US')}
                  </p>
                </div>
                <div className='flex items-center gap-1.5'>
                  <a
                    href={fileItem.downloadUrl}
                    target='_blank'
                    rel='noreferrer'
                    className='inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-100'
                    aria-label={isThai ? 'ดาวน์โหลดไฟล์' : 'Download file'}
                  >
                    <Download className='h-4 w-4' />
                  </a>
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    className='h-8 rounded-xl px-2.5'
                    disabled={deleting}
                    onClick={() => void handleDelete(fileItem)}
                    aria-label={isThai ? 'ลบไฟล์' : 'Delete file'}
                  >
                    {deleting ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Trash2 className='h-3.5 w-3.5' />}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
