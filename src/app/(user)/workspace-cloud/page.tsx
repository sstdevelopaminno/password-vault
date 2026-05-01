'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  ArrowLeft,
  CloudUpload,
  Download,
  File,
  FileArchive,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Grid3X3,
  List,
  Loader2,
  Music2,
  RefreshCcw,
  Search,
  Share2,
  Trash2,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { PinModal } from '@/components/vault/pin-modal';
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

type FileSort = 'latest' | 'oldest' | 'name_az' | 'size_desc';
type FileView = 'grid' | 'list';
type PinPolicy = { open_workspace_folder?: boolean; delete_workspace_file?: boolean };

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

function parseEmails(raw: string) {
  return Array.from(
    new Set(
      String(raw)
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function WorkspaceCloudPage() {
  const { locale } = useI18n();
  const { showToast } = useToast();
  const isThai = locale === 'th';

  const [folders, setFolders] = useState<WorkspaceFolderItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState('');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [shareEmailsByFolderId, setShareEmailsByFolderId] = useState<Record<string, string>>({});
  const [activeShareFolderId, setActiveShareFolderId] = useState('');
  const [sharingFolderId, setSharingFolderId] = useState('');

  const [files, setFiles] = useState<WorkspaceFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState('');

  const [fileQuery, setFileQuery] = useState('');
  const [fileSort, setFileSort] = useState<FileSort>('latest');
  const [fileView, setFileView] = useState<FileView>('grid');

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<WorkspaceFolderItem | null>(null);
  const [pinDeleteModalOpen, setPinDeleteModalOpen] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState('');

  const [pinOpenFolderModalOpen, setPinOpenFolderModalOpen] = useState(false);
  const [pendingOpenFolder, setPendingOpenFolder] = useState<WorkspaceFolderItem | null>(null);
  const [pinDeleteFileModalOpen, setPinDeleteFileModalOpen] = useState(false);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<WorkspaceFileItem | null>(null);
  const [pinPolicy, setPinPolicy] = useState<PinPolicy | null>(null);

  const activeFolder = useMemo(() => folders.find((item) => item.id === activeFolderId) ?? null, [folders, activeFolderId]);
  const requirePinToOpenFolder = pinPolicy?.open_workspace_folder !== false;
  const requirePinToDeleteFile = pinPolicy?.delete_workspace_file !== false;

  const filteredFiles = useMemo(() => {
    const query = fileQuery.trim().toLowerCase();
    const list = query
      ? files.filter((item) => {
          const name = String(item.name ?? '').toLowerCase();
          const mime = String(item.mimeType ?? '').toLowerCase();
          return name.includes(query) || mime.includes(query);
        })
      : [...files];

    list.sort((a, b) => {
      if (fileSort === 'oldest') return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      if (fileSort === 'name_az') return String(a.name ?? '').localeCompare(String(b.name ?? ''), isThai ? 'th' : 'en');
      if (fileSort === 'size_desc') return Number(b.size ?? 0) - Number(a.size ?? 0);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return list;
  }, [fileQuery, fileSort, files, isThai]);

  const loadFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const response = await fetch('/api/workspace-folders', { cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as { error?: string; folders?: WorkspaceFolderItem[] };
      if (!response.ok) {
        showToast(body.error || (isThai ? 'โหลดโฟลเดอร์ไม่สำเร็จ' : 'Failed to load folders'), 'error');
        setFolders([]);
        setActiveFolderId('');
        return;
      }

      const nextFolders = Array.isArray(body.folders) ? body.folders : [];
      setFolders(nextFolders);
      setActiveFolderId((prev) => (prev && nextFolders.some((item) => item.id === prev) ? prev : ''));
    } catch {
      showToast(isThai ? 'โหลดโฟลเดอร์ไม่สำเร็จ' : 'Failed to load folders', 'error');
      setFolders([]);
      setActiveFolderId('');
    } finally {
      setLoadingFolders(false);
    }
  }, [isThai, showToast]);

  const loadPinPolicy = useCallback(async () => {
    try {
      const response = await fetch('/api/pin/preferences', { cache: 'no-store' });
      if (!response.ok) return;
      const body = (await response.json().catch(() => ({}))) as { policy?: PinPolicy };
      if (body.policy) setPinPolicy(body.policy);
    } catch {
      // Keep default policy behavior.
    }
  }, []);

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
    void loadPinPolicy();
  }, [loadFolders, loadPinPolicy]);

  useEffect(() => {
    void loadFiles(activeFolderId);
  }, [activeFolderId, loadFiles]);

  const openFolderDirect = useCallback((folderId: string) => {
    setActiveFolderId(folderId);
    setFileQuery('');
  }, []);

  const requestOpenFolder = useCallback(
    (folder: WorkspaceFolderItem) => {
      if (!requirePinToOpenFolder) {
        openFolderDirect(folder.id);
        return;
      }
      setPendingOpenFolder(folder);
      setPinOpenFolderModalOpen(true);
    },
    [openFolderDirect, requirePinToOpenFolder],
  );

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

      const emailInput = String(shareEmailsByFolderId[folder.id] ?? '');
      const allEmails = parseEmails(emailInput);
      const validEmails = allEmails.filter(isValidEmail);
      if (validEmails.length === 0) {
        showToast(isThai ? 'กรุณาใส่อีเมลอย่างน้อย 1 รายการ' : 'Please enter at least one valid email', 'error');
        return;
      }

      setSharingFolderId(folder.id);
      let successCount = 0;
      const failed: string[] = [];

      try {
        for (const email of validEmails) {
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
            failed.push(email);
            continue;
          }

          successCount += 1;
          setFolders((prev) =>
            prev.map((row) => {
              if (row.id !== body.shared!.folderId) return row;
              const exists = row.sharedMembers.some((item) => item.userId === body.shared!.userId);
              const nextMembers = exists
                ? row.sharedMembers.map((item) =>
                    item.userId === body.shared!.userId ? { ...item, role: body.shared!.role, email: body.shared!.email } : item,
                  )
                : [...row.sharedMembers, body.shared!];
              return { ...row, sharedMembers: nextMembers };
            }),
          );
        }

        if (successCount > 0) {
          setShareEmailsByFolderId((prev) => ({ ...prev, [folder.id]: '' }));
        }

        if (successCount > 0 && failed.length === 0) {
          showToast(isThai ? `แชร์โฟลเดอร์สำเร็จ ${successCount} อีเมล` : `Folder shared to ${successCount} email(s)`, 'success');
        } else if (successCount > 0 && failed.length > 0) {
          showToast(
            isThai ? `แชร์สำเร็จ ${successCount} อีเมล, ไม่สำเร็จ ${failed.length} อีเมล` : `Shared ${successCount}, failed ${failed.length}`,
            'success',
          );
        } else {
          showToast(isThai ? 'แชร์โฟลเดอร์ไม่สำเร็จ' : 'Failed to share folder', 'error');
        }
      } catch {
        showToast(isThai ? 'แชร์โฟลเดอร์ไม่สำเร็จ' : 'Failed to share folder', 'error');
      } finally {
        setSharingFolderId('');
      }
    },
    [isThai, shareEmailsByFolderId, showToast],
  );

  const deleteFolderWithAssertion = useCallback(
    async (folder: WorkspaceFolderItem, assertionToken: string) => {
      setDeletingFolderId(folder.id);
      try {
        const response = await fetch('/api/workspace-folders/' + encodeURIComponent(folder.id), {
          method: 'DELETE',
          headers: { 'x-pin-assertion': assertionToken },
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          showToast(body.error || (isThai ? 'ลบโฟลเดอร์ไม่สำเร็จ' : 'Failed to delete folder'), 'error');
          return;
        }

        setFolders((prev) => prev.filter((item) => item.id !== folder.id));
        setShareEmailsByFolderId((prev) => {
          const next = { ...prev };
          delete next[folder.id];
          return next;
        });
        if (activeFolderId === folder.id) {
          setActiveFolderId('');
          setFiles([]);
        }
        showToast(isThai ? 'ลบโฟลเดอร์เรียบร้อย' : 'Folder deleted', 'success');
      } catch {
        showToast(isThai ? 'ลบโฟลเดอร์ไม่สำเร็จ' : 'Failed to delete folder', 'error');
      } finally {
        setDeletingFolderId('');
      }
    },
    [activeFolderId, isThai, showToast],
  );

  const requestDeleteFolder = useCallback(
    (folder: WorkspaceFolderItem) => {
      if (!folder.isOwner) {
        showToast(isThai ? 'ลบได้เฉพาะเจ้าของโฟลเดอร์' : 'Only folder owner can delete', 'error');
        return;
      }
      setPendingDeleteFolder(folder);
      setDeleteConfirmOpen(true);
    },
    [isThai, showToast],
  );

  const handleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const folderId = activeFolderId;
      const selectedFiles = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (!folderId || selectedFiles.length === 0) return;

      setUploading(true);
      try {
        for (const file of selectedFiles) {
          const formData = new FormData();
          formData.append('folderId', folderId);
          formData.append('file', file);
          const response = await fetch('/api/workspace-files', { method: 'POST', body: formData });
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (!response.ok) {
            throw new Error(body.error || (isThai ? 'อัปโหลดไฟล์ไม่สำเร็จ' : 'Upload failed'));
          }
        }

        showToast(
          isThai ? 'อัปโหลดไฟล์เรียบร้อย ' + String(selectedFiles.length) + ' รายการ' : 'Uploaded ' + String(selectedFiles.length) + ' file(s) successfully',
          'success',
        );
        await loadFiles(folderId);
      } catch (error) {
        showToast(String(error instanceof Error ? error.message : isThai ? 'อัปโหลดไฟล์ไม่สำเร็จ' : 'Upload failed'), 'error');
      } finally {
        setUploading(false);
      }
    },
    [activeFolderId, isThai, loadFiles, showToast],
  );

  const handleDeleteFileWithAssertion = useCallback(
    async (target: WorkspaceFileItem, assertionToken: string) => {
      if (!activeFolderId) return;
      setDeletingPath(target.path);
      try {
        const response = await fetch(
          '/api/workspace-files?folderId=' + encodeURIComponent(activeFolderId) + '&path=' + encodeURIComponent(target.path),
          { method: 'DELETE', headers: { 'x-pin-assertion': assertionToken } },
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
    [activeFolderId, isThai, showToast],
  );

  const requestDeleteFile = useCallback(
    (target: WorkspaceFileItem) => {
      if (!requirePinToDeleteFile) {
        void handleDeleteFileWithAssertion(target, '');
        return;
      }
      setPendingDeleteFile(target);
      setPinDeleteFileModalOpen(true);
    },
    [handleDeleteFileWithAssertion, requirePinToDeleteFile],
  );

  return (
    <section className='space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.4rem)] animate-screen-in'>
      <div className='neon-panel rounded-[22px] p-4'>
        <div className='flex items-start justify-between gap-2'>
          <div>
            <h1 className='text-app-h3 font-semibold text-slate-100'>{isThai ? 'คลาวด์ไฟล์งาน' : 'Cloud Files'}</h1>
            <p className='mt-1 text-app-caption text-slate-300'>{isThai ? `ไฟล์ทั้งหมด ${files.length} รายการ` : `${files.length} files`}</p>
          </div>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='h-9 rounded-xl px-3 text-app-caption'
            onClick={() => {
              void loadFolders();
              void loadPinPolicy();
            }}
            disabled={loadingFolders || uploading || creatingFolder}
          >
            {loadingFolders ? <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' /> : <RefreshCcw className='mr-1 h-3.5 w-3.5' />}
            {isThai ? 'รีเฟรช' : 'Refresh'}
          </Button>
        </div>

        {!activeFolderId ? (
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
        ) : null}
      </div>

      {!activeFolderId ? (
        <div className='space-y-2'>
          <p className='text-app-caption font-semibold text-slate-100'>{isThai ? 'โฟลเดอร์ / ห้องเก็บไฟล์' : 'Folders / Rooms'}</p>
          <div className='space-y-2'>
            {folders.map((folder) => (
              <div key={folder.id} className='rounded-2xl border border-[rgba(139,171,255,0.3)] bg-[rgba(17,33,84,0.62)] px-3 py-2.5'>
                <div className='flex items-center justify-between gap-2'>
                  <button type='button' onClick={() => requestOpenFolder(folder)} className='min-w-0 flex-1 text-left'>
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
                          onClick={() => setActiveShareFolderId((prev) => (prev === folder.id ? '' : folder.id))}
                        >
                          <Share2 className='h-3.5 w-3.5' />
                        </Button>
                        <Button
                          type='button'
                          variant='secondary'
                          size='sm'
                          className='h-8 rounded-xl px-2.5 text-rose-100'
                          onClick={() => requestDeleteFolder(folder)}
                          disabled={deletingFolderId === folder.id}
                        >
                          {deletingFolderId === folder.id ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Trash2 className='h-3.5 w-3.5' />}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                {folder.isOwner && activeShareFolderId === folder.id ? (
                  <div className='mt-2 grid grid-cols-[1fr_auto] gap-2'>
                    <input
                      value={String(shareEmailsByFolderId[folder.id] ?? '')}
                      onChange={(event) =>
                        setShareEmailsByFolderId((prev) => ({
                          ...prev,
                          [folder.id]: event.target.value,
                        }))
                      }
                      placeholder={isThai ? 'อีเมลหลายรายการคั่น , หรือ ;' : 'Multiple emails separated by , or ;'}
                      className='h-9 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(14,27,70,0.75)] px-3 text-app-caption text-slate-100 outline-none focus:border-[var(--border-strong)]'
                    />
                    <Button type='button' size='sm' className='h-9 rounded-xl px-3 text-app-caption' onClick={() => void shareFolder(folder)} disabled={sharingFolderId === folder.id}>
                      {sharingFolderId === folder.id ? <Loader2 className='mr-1 h-3.5 w-3.5 animate-spin' /> : <Share2 className='mr-1 h-3.5 w-3.5' />}
                      {isThai ? 'แชร์' : 'Share'}
                    </Button>
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
      ) : null}

      {activeFolder ? (
        <div className='space-y-3'>
          <div className='neon-soft-panel rounded-[20px] p-3'>
            <div className='flex items-center justify-between gap-2'>
              <div className='flex min-w-0 items-center gap-2'>
                <button
                  type='button'
                  className='inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-100'
                  onClick={() => {
                    setActiveFolderId('');
                    setFileQuery('');
                  }}
                  aria-label={isThai ? 'ย้อนกลับ' : 'Back'}
                >
                  <ArrowLeft className='h-4 w-4' />
                </button>
                <div className='min-w-0'>
                  <p className='line-clamp-1 text-app-body font-semibold text-slate-100'>{activeFolder.name}</p>
                  <p className='text-[11px] text-slate-300'>{isThai ? 'ไฟล์ในโฟลเดอร์นี้' : 'Files in this folder'}</p>
                </div>
              </div>

              <div className='flex items-center gap-1.5'>
                <Button
                  type='button'
                  variant={fileView === 'grid' ? 'default' : 'secondary'}
                  size='sm'
                  className='h-8 rounded-xl px-2.5'
                  onClick={() => setFileView('grid')}
                  aria-pressed={fileView === 'grid'}
                  title={isThai ? 'มุมมองแบบตาราง' : 'Grid view'}
                >
                  <Grid3X3 className='h-3.5 w-3.5' />
                </Button>
                <Button
                  type='button'
                  variant={fileView === 'list' ? 'default' : 'secondary'}
                  size='sm'
                  className='h-8 rounded-xl px-2.5'
                  onClick={() => setFileView('list')}
                  aria-pressed={fileView === 'list'}
                  title={isThai ? 'มุมมองแบบรายการ' : 'List view'}
                >
                  <List className='h-3.5 w-3.5' />
                </Button>
                <Button type='button' variant='secondary' size='sm' className='h-8 rounded-xl px-2.5' onClick={() => void loadFiles(activeFolder.id)} disabled={loadingFiles || uploading}>
                  {loadingFiles ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <RefreshCcw className='h-3.5 w-3.5' />}
                </Button>
              </div>
            </div>

            <div className='mt-2 grid grid-cols-[1fr_auto] gap-2'>
              <div className='relative'>
                <Search className='pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300' />
                <input
                  value={fileQuery}
                  onChange={(event) => setFileQuery(event.target.value)}
                  placeholder={isThai ? 'ค้นหาไฟล์ในโฟลเดอร์' : 'Search files in folder'}
                  className='h-9 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(14,27,70,0.75)] pl-9 pr-3 text-app-caption text-slate-100 outline-none focus:border-[var(--border-strong)]'
                />
              </div>
              <select
                value={fileSort}
                onChange={(event) => setFileSort(event.target.value as FileSort)}
                className='h-9 rounded-xl border border-[var(--border-soft)] bg-[rgba(14,27,70,0.75)] px-2 text-[11px] text-slate-100 outline-none'
              >
                <option value='latest'>{isThai ? 'ล่าสุด' : 'Latest'}</option>
                <option value='oldest'>{isThai ? 'เก่าสุด' : 'Oldest'}</option>
                <option value='name_az'>{isThai ? 'ชื่อ A-Z' : 'Name A-Z'}</option>
                <option value='size_desc'>{isThai ? 'ไฟล์ใหญ่สุด' : 'Largest'}</option>
              </select>
            </div>
          </div>

          <div className='neon-soft-panel rounded-[20px] p-3'>
            <label className='flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgba(122,175,255,0.62)] bg-[rgba(22,42,104,0.52)] px-3 py-3 text-center transition hover:bg-[rgba(34,57,134,0.58)]'>
              <input type='file' multiple className='hidden' onChange={handleUpload} />
              {uploading ? <Loader2 className='h-4 w-4 animate-spin text-cyan-100' /> : <CloudUpload className='h-4 w-4 text-cyan-100' />}
              <span className='text-app-caption font-semibold text-slate-100'>
                {uploading ? (isThai ? 'กำลังอัปโหลด...' : 'Uploading...') : isThai ? 'อัปโหลดไฟล์หรือรูปภาพเข้าโฟลเดอร์นี้' : 'Upload files or images to this folder'}
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

            {!loadingFiles && filteredFiles.length === 0 ? (
              <div className='rounded-[16px] border border-[rgba(139,171,255,0.28)] bg-[rgba(17,33,84,0.56)] p-4 text-center text-app-body text-slate-200'>
                {fileQuery.trim() ? (isThai ? 'ไม่พบไฟล์ตามคำค้นหา' : 'No files match your search.') : isThai ? 'โฟลเดอร์นี้ยังไม่มีไฟล์' : 'No files in this folder.'}
              </div>
            ) : null}

            {filteredFiles.length > 0 ? (
              <div className={fileView === 'grid' ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'rounded-[16px] border border-[rgba(139,171,255,0.28)] bg-[rgba(17,33,84,0.56)] p-2'}>
                {filteredFiles.map((fileItem) => {
                  const Icon = chooseFileIcon(fileItem.mimeType);
                  const deleting = deletingPath === fileItem.path;
                  const isImage = String(fileItem.mimeType ?? '').toLowerCase().startsWith('image/');

                  return (
                    <article
                      key={fileItem.path}
                      className={
                        fileView === 'list'
                          ? 'border-b border-[rgba(139,171,255,0.2)] px-1.5 py-2.5 last:border-b-0'
                          : 'rounded-[16px] border border-[rgba(139,171,255,0.28)] bg-[rgba(17,33,84,0.56)] p-2.5'
                      }
                    >
                      <div className='flex items-center gap-2.5'>
                        {isImage ? (
                          <img
                            src={fileItem.previewUrl}
                            alt={fileItem.name}
                            className={
                              (fileView === 'list' ? 'h-16 w-16' : 'h-20 w-20') +
                              ' shrink-0 rounded-xl border border-[var(--border-soft)] object-cover'
                            }
                            loading='lazy'
                          />
                        ) : (
                          <div
                            className={
                              'flex shrink-0 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[rgba(19,35,87,0.72)] ' +
                              (fileView === 'list' ? 'h-16 w-16' : 'h-20 w-20')
                            }
                          >
                            <Icon className='h-9 w-9 text-cyan-100' />
                          </div>
                        )}
                        <div className='min-w-0 flex-1'>
                          <p className={(fileView === 'list' ? 'line-clamp-1' : 'line-clamp-2') + ' text-app-caption font-semibold text-slate-100'}>{fileItem.name}</p>
                          <p className='mt-1 text-[11px] text-slate-300'>
                            {formatBytes(fileItem.size)} | {new Date(fileItem.updatedAt).toLocaleDateString(isThai ? 'th-TH' : 'en-US')}
                          </p>
                        </div>
                      </div>

                      <div className={fileView === 'list' ? 'mt-2 flex items-center justify-end gap-2' : 'mt-2.5 flex items-center gap-2'}>
                        <a
                          href={fileItem.downloadUrl}
                          target='_blank'
                          rel='noreferrer'
                          className={
                            fileView === 'list'
                              ? 'inline-flex h-8 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 text-slate-100'
                              : 'inline-flex h-8 flex-1 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-100'
                          }
                        >
                          <Download className='mr-1 h-4 w-4' />
                          <span className='text-[11px] font-semibold'>{isThai ? 'ดาวน์โหลด' : 'Download'}</span>
                        </a>
                        <Button
                          type='button'
                          variant='secondary'
                          size='sm'
                          className='h-8 rounded-xl px-2.5'
                          disabled={deleting || (!activeFolder?.isOwner && activeFolder?.memberRole !== 'editor')}
                          onClick={() => void requestDeleteFile(fileItem)}
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
        </div>
      ) : null}

      {deleteConfirmOpen && pendingDeleteFolder ? (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4'>
          <div className='w-full max-w-[420px] rounded-[22px] border border-cyan-300/35 bg-[linear-gradient(160deg,rgba(18,38,94,0.98),rgba(18,29,74,0.98))] p-4 shadow-[0_18px_44px_rgba(10,26,78,0.45)]'>
            <h3 className='text-app-h3 font-semibold text-slate-100'>{isThai ? 'ยืนยันการลบโฟลเดอร์' : 'Confirm Folder Deletion'}</h3>
            <p className='mt-2 text-app-caption text-slate-200'>
              {isThai ? `ลบโฟลเดอร์ "${pendingDeleteFolder.name}" และไฟล์ทั้งหมดภายในหรือไม่?` : `Delete folder "${pendingDeleteFolder.name}" and all files inside?`}
            </p>
            <div className='mt-4 grid grid-cols-2 gap-2'>
              <Button
                type='button'
                variant='secondary'
                className='h-10 rounded-xl'
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setPendingDeleteFolder(null);
                }}
              >
                {isThai ? 'ยกเลิก' : 'Cancel'}
              </Button>
              <Button
                type='button'
                className='h-10 rounded-xl'
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setPinDeleteModalOpen(true);
                }}
              >
                {isThai ? 'ยืนยันต่อ' : 'Continue'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {pinDeleteModalOpen && pendingDeleteFolder ? (
        <PinModal
          action='delete_workspace_folder'
          actionLabel={isThai ? `ลบโฟลเดอร์ ${pendingDeleteFolder.name}` : `Delete folder ${pendingDeleteFolder.name}`}
          targetItemId={pendingDeleteFolder.id}
          onClose={() => {
            setPinDeleteModalOpen(false);
            setPendingDeleteFolder(null);
          }}
          onVerified={(assertionToken) => {
            setPinDeleteModalOpen(false);
            const folder = pendingDeleteFolder;
            setPendingDeleteFolder(null);
            if (!folder) return;
            void deleteFolderWithAssertion(folder, assertionToken);
          }}
        />
      ) : null}

      {pinDeleteFileModalOpen && pendingDeleteFile ? (
        <PinModal
          action='delete_workspace_file'
          actionLabel={isThai ? `ลบไฟล์ ${pendingDeleteFile.name}` : `Delete file ${pendingDeleteFile.name}`}
          targetItemId={pendingDeleteFile.path}
          onClose={() => {
            setPinDeleteFileModalOpen(false);
            setPendingDeleteFile(null);
          }}
          onVerified={(assertionToken) => {
            const file = pendingDeleteFile;
            setPinDeleteFileModalOpen(false);
            setPendingDeleteFile(null);
            if (!file) return;
            void handleDeleteFileWithAssertion(file, assertionToken);
          }}
        />
      ) : null}

      {pinOpenFolderModalOpen && pendingOpenFolder ? (
        <PinModal
          action='open_workspace_folder'
          actionLabel={isThai ? `เปิดโฟลเดอร์ ${pendingOpenFolder.name}` : `Open folder ${pendingOpenFolder.name}`}
          targetItemId={pendingOpenFolder.id}
          onClose={() => {
            setPinOpenFolderModalOpen(false);
            setPendingOpenFolder(null);
          }}
          onVerified={() => {
            const folder = pendingOpenFolder;
            setPinOpenFolderModalOpen(false);
            setPendingOpenFolder(null);
            if (!folder) return;
            openFolderDirect(folder.id);
          }}
        />
      ) : null}
    </section>
  );
}
