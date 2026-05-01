'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  CloudUpload,
  Download,
  File,
  FileArchive,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Loader2,
  Music2,
  RefreshCcw,
  Share2,
  Trash2,
  Video,
} from 'lucide-react';
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
  previewUrl: string;
  downloadUrl: string;
};

type SharedMember = {
  userId: string;
  email: string;
  role: 'viewer' | 'editor';
};

type WorkspaceFolderItem = {
  id: string;
  name: string;
  ownerUserId: string;
  memberRole: 'owner' | 'viewer' | 'editor';
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  sharedMembers: SharedMember[];
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

  const [folders, setFolders] = useState<WorkspaceFolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [shareEmailByFolderId, setShareEmailByFolderId] = useState<Record<string, string>>({});
  const [activeShareFolderId, setActiveShareFolderId] = useState('');
  const [sharingFolderId, setSharingFolderId] = useState('');
  const [deletingFolderId, setDeletingFolderId] = useState('');

  const [files, setFiles] = useState<WorkspaceFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState('');

  const selectedFolder = useMemo(
    () => folders.find((item) => item.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const fileCountLabel = useMemo(() => {
    if (isThai) return 'ไฟล์ทั้งหมด ' + String(files.length) + ' รายการ';
    return String(files.length) + ' files';
  }, [files.length, isThai]);

  const loadFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const response = await fetch('/api/workspace-folders', { cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as { error?: string; folders?: WorkspaceFolderItem[] };
      if (!response.ok) {
        showToast(body.error || (isThai ? 'โหลดโฟลเดอร์ไม่สำเร็จ' : 'Failed to load folders'), 'error');
        setFolders([]);
        setSelectedFolderId('');
        return;
      }
      const nextFolders = Array.isArray(body.folders) ? body.folders : [];
      setFolders(nextFolders);
      setSelectedFolderId((prev) => {
        if (prev && nextFolders.some((item) => item.id === prev)) return prev;
        return nextFolders[0]?.id ?? '';
      });
    } catch {
      showToast(isThai ? 'โหลดโฟลเดอร์ไม่สำเร็จ' : 'Failed to load folders', 'error');
      setFolders([]);
      setSelectedFolderId('');
    } finally {
      setLoadingFolders(false);
    }
  }, [isThai, showToast]);

  const loadFiles = useCallback(
    async (folderId: string) => {
      if (!folderId) {
        setFiles([]);
        return;
      }
      setLoadingFiles(true);
      try {
        const response = await fetch('/api/workspace-files?folderId=' + encodeURIComponent(folderId), { cache: 'no-store' });
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
        setLoadingFiles(false);
      }
    },
    [isThai, showToast],
  );

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    void loadFiles(selectedFolderId);
  }, [loadFiles, selectedFolderId]);

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) {
      showToast(isThai ? 'กรุณาใส่ชื่อโฟลเดอร์' : 'Please enter folder name', 'error');
      return;
    }
    setCreatingFolder(true);
    try {
      const response = await fetch('/api/workspace-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; folder?: WorkspaceFolderItem };
      if (!response.ok || !body.folder) {
        showToast(body.error || (isThai ? 'สร้างโฟลเดอร์ไม่สำเร็จ' : 'Failed to create folder'), 'error');
        return;
      }
      setFolders((prev) => [body.folder as WorkspaceFolderItem, ...prev]);
      setSelectedFolderId(String(body.folder.id));
      setNewFolderName('');
      showToast(isThai ? 'สร้างโฟลเดอร์ใหม่แล้ว' : 'Folder created', 'success');
    } catch {
      showToast(isThai ? 'สร้างโฟลเดอร์ไม่สำเร็จ' : 'Failed to create folder', 'error');
    } finally {
      setCreatingFolder(false);
    }
  }, [isThai, newFolderName, showToast]);

  const shareFolder = useCallback(
    async (folder: WorkspaceFolderItem) => {
      if (!folder.isOwner) {
        showToast(isThai ? 'แชร์ได้เฉพาะเจ้าของโฟลเดอร์' : 'Only folder owner can share', 'error');
        return;
      }
      const email = String(shareEmailByFolderId[folder.id] ?? '')
        .trim()
        .toLowerCase();
      if (!email) {
        showToast(isThai ? 'กรุณาใส่อีเมลผู้รับ' : 'Please enter recipient email', 'error');
        return;
      }

      setSharingFolderId(folder.id);
      try {
        const response = await fetch('/api/workspace-folders/' + encodeURIComponent(folder.id) + '/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: 'editor' }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          shared?: { folderId: string; userId: string; email: string; role: 'viewer' | 'editor' };
        };
        if (!response.ok || !body.shared) {
          showToast(body.error || (isThai ? 'แชร์โฟลเดอร์ไม่สำเร็จ' : 'Failed to share folder'), 'error');
          return;
        }

        setShareEmailByFolderId((prev) => ({ ...prev, [folder.id]: '' }));
        setFolders((prev) =>
          prev.map((row) => {
            if (row.id !== body.shared!.folderId) return row;
            const exists = row.sharedMembers.some((item) => item.userId === body.shared!.userId);
            const nextMembers = exists
              ? row.sharedMembers.map((item) =>
                  item.userId === body.shared!.userId ? { ...item, role: body.shared!.role, email: body.shared!.email } : item,
                )
              : [...row.sharedMembers, body.shared!];
            return {
              ...row,
              sharedMembers: nextMembers,
            };
          }),
        );
        showToast(isThai ? 'แชร์โฟลเดอร์เรียบร้อย' : 'Folder shared', 'success');
      } catch {
        showToast(isThai ? 'แชร์โฟลเดอร์ไม่สำเร็จ' : 'Failed to share folder', 'error');
      } finally {
        setSharingFolderId('');
      }
    },
    [isThai, shareEmailByFolderId, showToast],
  );

  const deleteFolder = useCallback(
    async (folder: WorkspaceFolderItem) => {
      if (!folder.isOwner) {
        showToast(isThai ? 'ลบได้เฉพาะเจ้าของโฟลเดอร์' : 'Only folder owner can delete', 'error');
        return;
      }
      const confirmed =
        typeof window === 'undefined'
          ? true
          : window.confirm(
              isThai
                ? 'ยืนยันการลบโฟลเดอร์ "' + folder.name + '" และไฟล์ทั้งหมดในโฟลเดอร์นี้?'
                : 'Delete folder "' + folder.name + '" and all files inside it?',
            );
      if (!confirmed) return;

      setDeletingFolderId(folder.id);
      try {
        const response = await fetch('/api/workspace-folders/' + encodeURIComponent(folder.id), { method: 'DELETE' });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          showToast(body.error || (isThai ? 'ลบโฟลเดอร์ไม่สำเร็จ' : 'Failed to delete folder'), 'error');
          return;
        }

        setFolders((prev) => prev.filter((item) => item.id !== folder.id));
        setShareEmailByFolderId((prev) => {
          const next = { ...prev };
          delete next[folder.id];
          return next;
        });
        if (selectedFolderId === folder.id) {
          setSelectedFolderId('');
          setFiles([]);
        }
        showToast(isThai ? 'ลบโฟลเดอร์เรียบร้อย' : 'Folder deleted', 'success');
      } catch {
        showToast(isThai ? 'ลบโฟลเดอร์ไม่สำเร็จ' : 'Failed to delete folder', 'error');
      } finally {
        setDeletingFolderId('');
      }
    },
    [isThai, selectedFolderId, showToast],
  );

  const handleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const folderId = selectedFolderId;
      const selectedFiles = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (!folderId || selectedFiles.length === 0) return;

      setUploading(true);
      try {
        for (const file of selectedFiles) {
          const formData = new FormData();
          formData.append('folderId', folderId);
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
        await loadFiles(folderId);
      } catch (error) {
        showToast(String(error instanceof Error ? error.message : isThai ? 'อัปโหลดไฟล์ไม่สำเร็จ' : 'Upload failed'), 'error');
      } finally {
        setUploading(false);
      }
    },
    [isThai, loadFiles, selectedFolderId, showToast],
  );

  const handleDelete = useCallback(
    async (target: WorkspaceFileItem) => {
      if (!selectedFolderId) return;
      setDeletingPath(target.path);
      try {
        const response = await fetch(
          '/api/workspace-files?folderId=' + encodeURIComponent(selectedFolderId) + '&path=' + encodeURIComponent(target.path),
          {
            method: 'DELETE',
          },
        );
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
    [isThai, selectedFolderId, showToast],
  );

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <div className='neon-panel rounded-[22px] p-4'>
        <div className='flex items-start justify-between gap-2'>
          <div>
            <h1 className='text-app-h3 font-semibold text-slate-100'>{isThai ? 'คลาวด์ไฟล์งาน' : 'Cloud Files'}</h1>
            <p className='mt-1 text-app-caption text-slate-300'>{fileCountLabel}</p>
          </div>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='h-9 rounded-xl px-3 text-app-caption'
            onClick={() => void loadFolders()}
            disabled={loadingFolders || uploading || creatingFolder}
          >
            {loadingFolders ? <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' /> : <RefreshCcw className='mr-1 h-3.5 w-3.5' />}
            {isThai ? 'รีเฟรช' : 'Refresh'}
          </Button>
        </div>

        <div className='mt-3 grid grid-cols-[1fr_auto] gap-2'>
          <input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder={isThai ? 'ตั้งชื่อ New folder / ห้องเก็บไฟล์' : 'New folder name'}
            className='h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(16,31,78,0.72)] px-3 text-app-body text-slate-100 outline-none focus:border-[var(--border-strong)]'
          />
          <Button type='button' className='h-10 rounded-xl px-3 text-app-caption' onClick={() => void createFolder()} disabled={creatingFolder}>
            {creatingFolder ? <Loader2 className='mr-1 h-4 w-4 animate-spin' /> : <FolderPlus className='mr-1 h-4 w-4' />}
            {isThai ? 'สร้าง' : 'Create'}
          </Button>
        </div>
      </div>

      <div className='space-y-2'>
        <p className='text-app-caption font-semibold text-slate-100'>{isThai ? 'โฟลเดอร์ / ห้องเก็บไฟล์' : 'Folders / Rooms'}</p>
        <div className='space-y-2'>
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={
                'rounded-2xl border px-3 py-2.5 transition ' +
                (selectedFolderId === folder.id
                  ? 'border-cyan-300/65 bg-[rgba(35,80,152,0.46)] shadow-[0_0_22px_rgba(74,157,255,0.2)]'
                  : 'border-[rgba(139,171,255,0.3)] bg-[rgba(17,33,84,0.62)]')
              }
            >
              <div className='flex items-center justify-between gap-2'>
                <button type='button' onClick={() => setSelectedFolderId(folder.id)} className='min-w-0 flex-1 text-left'>
                  <p className='flex items-center gap-2 text-app-caption font-semibold text-slate-100'>
                    <Folder className='h-4 w-4 text-cyan-200' />
                    <span className='line-clamp-1'>{folder.name}</span>
                  </p>
                  <p className='mt-1 text-[10px] text-slate-300'>
                    {folder.isOwner
                      ? isThai
                        ? 'เจ้าของโฟลเดอร์'
                        : 'Owner'
                      : folder.memberRole === 'editor'
                        ? isThai
                          ? 'แชร์แบบแก้ไขได้'
                          : 'Shared (editor)'
                        : isThai
                          ? 'แชร์แบบดูได้'
                          : 'Shared (viewer)'}
                  </p>
                </button>
                <div className='flex shrink-0 items-center gap-1.5'>
                  {folder.isOwner ? (
                    <>
                      <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        className='h-8 rounded-xl px-2.5'
                        onClick={() => {
                          setSelectedFolderId(folder.id);
                          setActiveShareFolderId((prev) => (prev === folder.id ? '' : folder.id));
                        }}
                        aria-label={isThai ? 'แชร์โฟลเดอร์' : 'Share folder'}
                      >
                        <Share2 className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        className='h-8 rounded-xl px-2.5 text-rose-100'
                        onClick={() => void deleteFolder(folder)}
                        disabled={deletingFolderId === folder.id}
                        aria-label={isThai ? 'ลบโฟลเดอร์' : 'Delete folder'}
                      >
                        {deletingFolderId === folder.id ? (
                          <Loader2 className='h-3.5 w-3.5 animate-spin' />
                        ) : (
                          <Trash2 className='h-3.5 w-3.5' />
                        )}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {folder.isOwner && activeShareFolderId === folder.id ? (
                <div className='mt-2 grid grid-cols-[1fr_auto] gap-2'>
                  <input
                    value={String(shareEmailByFolderId[folder.id] ?? '')}
                    onChange={(event) =>
                      setShareEmailByFolderId((prev) => ({
                        ...prev,
                        [folder.id]: event.target.value,
                      }))
                    }
                    placeholder={isThai ? 'อีเมลผู้ใช้ในระบบเดียวกัน' : 'User email in same app'}
                    className='h-9 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(14,27,70,0.75)] px-3 text-app-caption text-slate-100 outline-none focus:border-[var(--border-strong)]'
                  />
                  <Button
                    type='button'
                    size='sm'
                    className='h-9 rounded-xl px-3 text-app-caption'
                    onClick={() => void shareFolder(folder)}
                    disabled={sharingFolderId === folder.id}
                  >
                    {sharingFolderId === folder.id ? (
                      <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <Share2 className='mr-1 h-3.5 w-3.5' />
                    )}
                    {isThai ? 'แชร์' : 'Share'}
                  </Button>
                </div>
              ) : null}

              {folder.isOwner && folder.sharedMembers.length > 0 ? (
                <div className='mt-2 flex flex-wrap gap-1.5'>
                  {folder.sharedMembers.map((member) => (
                    <span
                      key={member.userId}
                      className='rounded-full border border-[rgba(161,196,255,0.42)] bg-[rgba(35,57,126,0.46)] px-2 py-1 text-[10px] text-slate-200'
                    >
                      {member.email} | {member.role}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {!loadingFolders && folders.length === 0 ? (
            <p className='rounded-xl border border-[var(--border-soft)] bg-[rgba(17,33,84,0.7)] p-3 text-app-caption text-slate-300'>
              {isThai ? 'ยังไม่มีโฟลเดอร์ สร้าง New folder ด้านบนเพื่อเริ่มใช้งาน' : 'No folders yet. Create a new folder above to get started.'}
            </p>
          ) : null}
        </div>
      </div>

      <div className='neon-soft-panel rounded-[20px] p-3'>
        <p className='mb-2 text-app-caption font-semibold text-slate-100'>
          {selectedFolder
            ? isThai
              ? 'ไฟล์ในโฟลเดอร์: ' + selectedFolder.name
              : 'Files in: ' + selectedFolder.name
            : isThai
              ? 'ไฟล์ในโฟลเดอร์'
              : 'Folder files'}
        </p>
        <label className='flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgba(122,175,255,0.62)] bg-[rgba(22,42,104,0.52)] px-3 py-3 text-center transition hover:bg-[rgba(34,57,134,0.58)]'>
          <input type='file' multiple className='hidden' onChange={handleUpload} disabled={!selectedFolderId} />
          {uploading ? <Loader2 className='h-4 w-4 animate-spin text-cyan-100' /> : <CloudUpload className='h-4 w-4 text-cyan-100' />}
          <span className='text-app-caption font-semibold text-slate-100'>
            {!selectedFolderId
              ? isThai
                ? 'เลือกโฟลเดอร์ก่อนอัปโหลดไฟล์'
                : 'Select a folder before upload'
              : uploading
                ? isThai
                  ? 'กำลังอัปโหลด...'
                  : 'Uploading...'
                : isThai
                  ? 'อัปโหลดไฟล์หรือรูปภาพเข้าโฟลเดอร์ที่เลือก'
                  : 'Upload files or images to selected folder'}
          </span>
          <FilePlus2 className='h-4 w-4 text-cyan-100' />
        </label>
      </div>

      <div className='space-y-2'>
        {loadingFiles ? (
          <div className='rounded-[16px] border border-[rgba(139,171,255,0.28)] bg-[rgba(17,33,84,0.56)] p-3 text-app-caption text-slate-200'>
            {isThai ? 'กำลังโหลดไฟล์...' : 'Loading files...'}
          </div>
        ) : null}

        {!loadingFiles && selectedFolderId && files.length === 0 ? (
          <div className='rounded-[16px] border border-[rgba(139,171,255,0.28)] bg-[rgba(17,33,84,0.56)] p-4 text-center text-app-body text-slate-200'>
            {isThai ? 'โฟลเดอร์นี้ยังไม่มีไฟล์' : 'No files in this folder.'}
          </div>
        ) : null}

        {!selectedFolderId ? (
          <div className='rounded-[16px] border border-[rgba(139,171,255,0.28)] bg-[rgba(17,33,84,0.56)] p-4 text-center text-app-body text-slate-200'>
            {isThai ? 'เลือกโฟลเดอร์ก่อน เพื่อแสดงไฟล์' : 'Select a folder to display files.'}
          </div>
        ) : null}

        {selectedFolderId ? (
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
            {files.map((fileItem) => {
              const Icon = chooseFileIcon(fileItem.mimeType);
              const deleting = deletingPath === fileItem.path;
              const isImage = String(fileItem.mimeType ?? '').toLowerCase().startsWith('image/');
              return (
                <article
                  key={fileItem.path}
                  className='rounded-[16px] border border-[rgba(139,171,255,0.28)] bg-[rgba(17,33,84,0.56)] p-2.5'
                >
                  <div className='flex items-center gap-2.5'>
                    {isImage ? (
                      <img
                        src={fileItem.previewUrl}
                        alt={fileItem.name}
                        className='h-20 w-20 shrink-0 rounded-xl border border-[var(--border-soft)] object-cover'
                        loading='lazy'
                      />
                    ) : (
                      <div className='flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[rgba(19,35,87,0.72)]'>
                        <Icon className='h-9 w-9 text-cyan-100' />
                      </div>
                    )}
                    <div className='min-w-0 flex-1'>
                      <p className='line-clamp-2 text-app-caption font-semibold text-slate-100'>{fileItem.name}</p>
                      <p className='mt-1 text-[11px] text-slate-300'>
                        {formatBytes(fileItem.size)} | {new Date(fileItem.updatedAt).toLocaleDateString(isThai ? 'th-TH' : 'en-US')}
                      </p>
                    </div>
                  </div>
                  <div className='mt-2.5 flex items-center gap-2'>
                    <a
                      href={fileItem.downloadUrl}
                      target='_blank'
                      rel='noreferrer'
                      className='inline-flex h-8 flex-1 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-100'
                      aria-label={isThai ? 'ดาวน์โหลดไฟล์' : 'Download file'}
                    >
                      <Download className='mr-1 h-4 w-4' />
                      <span className='text-[11px] font-semibold'>{isThai ? 'ดาวน์โหลด' : 'Download'}</span>
                    </a>
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      className='h-8 rounded-xl px-2.5'
                      disabled={deleting || (!selectedFolder?.isOwner && selectedFolder?.memberRole !== 'editor')}
                      onClick={() => void handleDelete(fileItem)}
                      aria-label={isThai ? 'ลบไฟล์' : 'Delete file'}
                    >
                      {deleting ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Trash2 className='h-3.5 w-3.5' />}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
