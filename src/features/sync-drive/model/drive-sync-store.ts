/**
 * @fileoverview Состояние синхронизации с Google Drive.
 */

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import {
  loadDriveConfig,
  loadLastSyncAt,
  saveDriveConfig,
  saveLastSyncAt,
} from '@/features/sync-drive/model/drive-config';
import { syncDrive } from '@/features/sync-drive/model/drive-sync';
import type {
  DriveConfig,
  DriveSyncState,
  SyncProgress,
  SyncSummary,
} from '@/features/sync-drive/model/drive-types';
import { formatDateTime } from '@/shared/lib/date';
import { translate } from '@/shared/i18n';

function summaryDetail(summary: SyncSummary): string {
  const parts = [
    translate('sync.detail.summaryUploaded', { count: summary.uploaded }),
    translate('sync.detail.summaryDownloaded', { count: summary.downloaded }),
    translate('sync.detail.summarySkipped', { count: summary.skipped }),
  ];
  if (summary.conflicts > 0) {
    parts.push(
      translate('sync.detail.summaryConflicts', {
        count: summary.conflicts,
      }),
    );
  }
  if (summary.skippedLarge > 0) {
    parts.push(
      translate('sync.detail.summaryLarge', {
        count: summary.skippedLarge,
      }),
    );
  }
  return `${parts.join(', ')}.`;
}

export const useDriveSyncStore = defineStore('drive-sync', () => {
  const config = ref<DriveConfig>(loadDriveConfig());
  const state = ref<DriveSyncState>(
    config.value.url && config.value.token ? 'idle' : 'not-configured',
  );
  const detail = ref(
    config.value.url && config.value.token
      ? translate('sync.detail.ready')
      : translate('sync.detail.initial'),
  );
  const lastSyncAt = ref(loadLastSyncAt());
  const progress = ref<SyncProgress | null>(null);
  let pendingSync = false;
  const pendingTaskSync = ref(false);

  const configured = computed(() =>
    Boolean(config.value.url && config.value.token),
  );
  const syncing = computed(() => state.value === 'syncing');
  const statusLabel = computed(() => {
    switch (state.value) {
      case 'not-configured':
        return translate('sync.state.notConfigured');
      case 'syncing':
        return translate('sync.state.syncing');
      case 'ready':
        return translate('sync.state.ready');
      case 'error':
        return translate('sync.state.error');
      case 'offline':
        return translate('sync.state.offline');
      default:
        return translate('sync.state.idle');
    }
  });
  const statusDetail = computed(() => {
    if (progress.value && state.value === 'syncing') {
      const { phase, current, total } = progress.value;
      if (total > 0) {
        const labelKey =
          phase === 'download'
            ? 'sync.detail.downloading'
            : 'sync.detail.uploading';
        return translate('sync.detail.progress', {
          label: translate(labelKey),
          current,
          total,
        });
      }
      return translate('sync.detail.loading');
    }
    return detail.value;
  });
  const lastSyncLabel = computed(() =>
    lastSyncAt.value ? formatDateTime(lastSyncAt.value) : '',
  );

  function configure(next: DriveConfig): void {
    config.value = { url: next.url.trim(), token: next.token.trim() };
    saveDriveConfig(config.value);
    state.value = configured.value ? 'idle' : 'not-configured';
    detail.value = configured.value
      ? translate('sync.detail.ready')
      : translate('sync.detail.initial');
  }

  function clear(): void {
    config.value = { url: '', token: '' };
    saveDriveConfig(config.value);
    state.value = 'not-configured';
    detail.value = translate('sync.detail.disabled');
  }

  function requestTaskSync(): void {
    pendingTaskSync.value = true;
  }

  function flushPendingTaskSync(): void {
    if (!pendingTaskSync.value) {
      return;
    }
    pendingTaskSync.value = false;
    if (configured.value) {
      void sync();
    }
  }

  async function sync(): Promise<void> {
    if (syncing.value) {
      pendingSync = true;
      return;
    }
    if (!configured.value) {
      state.value = 'error';
      detail.value = translate('sync.detail.needSettings');
      return;
    }
    if (!navigator.onLine) {
      state.value = 'offline';
      detail.value = translate('sync.detail.offline');
      return;
    }

    pendingTaskSync.value = false;
    state.value = 'syncing';
    detail.value = translate('sync.detail.loading');
    progress.value = null;

    try {
      const summary = await syncDrive(config.value, next => {
        progress.value = next;
      });
      const now = new Date().toISOString();
      lastSyncAt.value = now;
      saveLastSyncAt(now);
      state.value = 'ready';
      detail.value = summaryDetail(summary);
    } catch (error) {
      state.value = 'error';
      detail.value =
        error instanceof Error
          ? error.message
          : translate('sync.detail.failed');
    } finally {
      progress.value = null;
      if (pendingSync) {
        pendingSync = false;
        void sync();
      }
    }
  }

  return {
    config,
    state,
    detail,
    lastSyncAt,
    progress,
    configured,
    syncing,
    statusLabel,
    statusDetail,
    lastSyncLabel,
    configure,
    clear,
    requestTaskSync,
    flushPendingTaskSync,
    sync,
  };
});
