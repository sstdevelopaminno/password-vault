'use client';

import { detectRuntimeCapabilities } from '@/lib/pwa-runtime';
import {
  readVaultShieldDeviceContacts,
  requestVaultShieldContactsPermission,
  type VaultShieldDeviceContact,
} from '@/lib/vault-shield';

export type MobileContact = {
  id: string;
  name: string;
  number: string;
  label: 'family' | 'work' | 'service' | 'unknown';
};

export type MobileContactsPermission = 'granted' | 'denied' | 'denied_permanently' | 'unavailable' | 'unknown';

export type MobileContactsResult = {
  contacts: MobileContact[];
  source: 'device' | 'server-seed' | 'web';
  permission: MobileContactsPermission;
};

type ContactsPayload = {
  contacts?: MobileContact[];
};

function sanitizeContactRow(input: VaultShieldDeviceContact | MobileContact, index: number): MobileContact {
  const name = String(input.name ?? '').trim();
  const label = String(input.label ?? 'unknown');

  return {
    id: String(input.id ?? `c-${index + 1}`),
    name: name || 'ไม่ทราบชื่อ',
    number: String(input.number ?? '').trim(),
    label: label === 'family' || label === 'work' || label === 'service' ? label : 'unknown',
  };
}

function dedupeContacts(rows: MobileContact[]) {
  const seen = new Set<string>();
  const output: MobileContact[] = [];
  for (const row of rows) {
    const normalized = row.number.replace(/[^0-9]/g, '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(row);
  }
  return output;
}

async function loadServerSeedContacts(): Promise<MobileContact[]> {
  const response = await fetch('/api/phone/contacts', { cache: 'no-store' });
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => ({}))) as ContactsPayload;
  const rows = Array.isArray(payload.contacts) ? payload.contacts : [];
  return dedupeContacts(rows.map((row, index) => sanitizeContactRow(row, index)));
}

export async function readMobileContacts(options?: {
  requestPermission?: boolean;
  limit?: number;
}): Promise<MobileContactsResult> {
  const runtime = detectRuntimeCapabilities();
  if (runtime.isCapacitorNative && runtime.isAndroid) {
    let permission: MobileContactsPermission = 'unknown';
    if (options?.requestPermission) {
      permission = await requestVaultShieldContactsPermission();
    }

    if (permission === 'granted' || permission === 'unknown') {
      const payload = await readVaultShieldDeviceContacts(options?.limit ?? 300);
      const rows = Array.isArray(payload?.contacts) ? payload?.contacts : [];
      const contacts = dedupeContacts(rows.map((row, index) => sanitizeContactRow(row, index)));
      if (contacts.length > 0) {
        return {
          contacts,
          source: 'device',
          permission: payload?.permission === 'granted' ? 'granted' : permission,
        };
      }
      if (payload?.permission === 'denied') {
        permission = 'denied';
      }
    }

    return {
      contacts: [],
      source: 'device',
      permission,
    };
  }

  const contacts = await loadServerSeedContacts();
  return {
    contacts,
    source: runtime.isIos || runtime.isAndroid ? 'web' : 'server-seed',
    permission: 'unavailable',
  };
}
