/**
 * @fileoverview Конфигурация синхронизации с Google Apps Script.
 */

import type { DriveConfig } from '@/features/sync-drive/model/drive-types';

const CONFIG_KEY = 'notes.drive.config.v1';
const LAST_SYNC_KEY = 'notes.drive.last-sync.v1';

export const DEFAULT_DRIVE_SYNC_URL = import.meta.env.VITE_DRIVE_SYNC_URL ?? '';

export function loadDriveConfig(): DriveConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) {
      return { url: DEFAULT_DRIVE_SYNC_URL, token: '' };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { url: DEFAULT_DRIVE_SYNC_URL, token: '' };
    }
    const record = parsed as Record<string, unknown>;
    return {
      url:
        typeof record['url'] === 'string'
          ? record['url']
          : DEFAULT_DRIVE_SYNC_URL,
      token: typeof record['token'] === 'string' ? record['token'] : '',
    };
  } catch {
    return { url: DEFAULT_DRIVE_SYNC_URL, token: '' };
  }
}

export function saveDriveConfig(config: DriveConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // В приватном режиме localStorage может быть недоступен.
  }
}

export function loadLastSyncAt(): string {
  try {
    return localStorage.getItem(LAST_SYNC_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastSyncAt(value: string): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, value);
  } catch {
    // Необязательное сохранение.
  }
}

/**
 * Привязывает токен из `?drive_token=...` (и опционально URL из `drive_url`)
 * к локальной настройке и убирает секрет из адресной строки.
 */
export function bindDriveConfigFromQuery(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  const token = url.searchParams.get('drive_token')?.trim() ?? '';
  const driveUrl = url.searchParams.get('drive_url')?.trim() ?? '';
  if (!token && !driveUrl) {
    return;
  }

  const current = loadDriveConfig();
  saveDriveConfig({
    url: driveUrl || current.url,
    token: token || current.token,
  });

  stripDriveSecretsFromUrl();
}

export function stripDriveSecretsFromUrl(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const url = new URL(window.location.href);
  const hadToken = url.searchParams.has('drive_token');
  const hadUrl = url.searchParams.has('drive_url');
  if (!hadToken && !hadUrl) {
    return;
  }
  url.searchParams.delete('drive_token');
  url.searchParams.delete('drive_url');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', next || '/');
}
