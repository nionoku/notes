/**
 * @fileoverview Синхронизация локальной базы с Google Drive.
 */

import { noteRepository } from '@/entities/note/api/note-repository';
import { useNotesStore } from '@/entities/note/model/note-store';
import type { Note } from '@/entities/note/model/note-types';
import { AppsScriptTransport } from '@/features/sync-drive/model/apps-script-transport';
import type {
  DriveConfig,
  LocalSyncFile,
  RemoteFile,
  SyncPlan,
  SyncProgress,
  SyncSummary,
} from '@/features/sync-drive/model/drive-types';
import { base64ToBytes, bytesToBase64 } from '@/shared/lib/base64';
import { sha256Hex } from '@/shared/lib/hash';
import { translate } from '@/shared/i18n';

export const MAX_SYNC_FILE_SIZE = 8 * 1024 * 1024;

export interface LocalFilesResult {
  readonly files: readonly LocalSyncFile[];
  readonly skippedLarge: number;
}

export async function collectLocalFiles(
  notes: readonly Note[],
): Promise<LocalFilesResult> {
  const noteHashes = new Map(
    notes.map(note => [`${note.filePath}.md`, note.hash]),
  );
  const storedFiles = await noteRepository.listAllFiles();
  const files: LocalSyncFile[] = [];
  let skippedLarge = 0;

  for (const stored of storedFiles) {
    if (stored.file.size > MAX_SYNC_FILE_SIZE) {
      skippedLarge += 1;
      continue;
    }
    const hash =
      noteHashes.get(stored.path) ??
      (await sha256Hex(await stored.file.arrayBuffer()));
    files.push({
      path: stored.path,
      file: stored.file,
      hash,
      size: stored.file.size,
      modified: stored.file.lastModified,
    });
  }

  return { files, skippedLarge };
}

export function planSync(
  localFiles: readonly LocalSyncFile[],
  remoteFiles: readonly RemoteFile[],
): SyncPlan {
  const localByPath = new Map(localFiles.map(file => [file.path, file]));
  const remoteByPath = new Map(remoteFiles.map(file => [file.path, file]));
  const uploads: LocalSyncFile[] = [];
  const downloads: RemoteFile[] = [];
  const downloadPaths = new Set<string>();
  let skipped = 0;
  let conflicts = 0;

  for (const local of localFiles) {
    const remote = remoteByPath.get(local.path);
    if (!remote) {
      uploads.push(local);
      continue;
    }
    if (remote.hash === local.hash) {
      skipped += 1;
      continue;
    }

    conflicts += 1;
    if (local.modified >= remote.modified) {
      uploads.push(local);
    } else {
      downloads.push(remote);
      downloadPaths.add(remote.path);
    }
  }

  for (const remote of remoteFiles) {
    if (!localByPath.has(remote.path) && !downloadPaths.has(remote.path)) {
      downloads.push(remote);
      downloadPaths.add(remote.path);
    }
  }

  return {
    uploads: uploads.sort((first, second) =>
      first.path.localeCompare(second.path),
    ),
    downloads: downloads.sort((first, second) =>
      first.path.localeCompare(second.path),
    ),
    skipped,
    conflicts,
  };
}

export async function syncDrive(
  config: DriveConfig,
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncSummary> {
  if (!config.url || !config.token) {
    throw new Error(translate('syncService.notConfigured'));
  }

  const notesStore = useNotesStore();
  await notesStore.loadAll(true);
  if (notesStore.status === 'error') {
    throw new Error(notesStore.error || translate('syncService.loadFailed'));
  }

  const transport = new AppsScriptTransport(config.url, config.token);
  try {
    const local = await collectLocalFiles(notesStore.notes);
    onProgress?.({ phase: 'manifest', current: 0, total: 0 });
    const manifest = await transport.manifest();
    const plan = planSync(local.files, manifest.files ?? []);
    const total = plan.uploads.length + plan.downloads.length;
    let current = 0;

    for (const upload of plan.uploads) {
      const buffer = await upload.file.arrayBuffer();
      const hash = await sha256Hex(buffer);
      const result = await transport.upload(
        upload.path,
        bytesToBase64(new Uint8Array(buffer)),
        hash,
      );
      if (result.hash !== hash) {
        throw new Error(
          translate('syncService.hashUpload', { path: upload.path }),
        );
      }
      current += 1;
      onProgress?.({ phase: 'upload', current, total });
    }

    for (const download of plan.downloads) {
      const result = await transport.download(download.path);
      const bytes = base64ToBytes(result.base64);
      const hash = await sha256Hex(bytes);
      if (result.hash && result.hash !== hash) {
        throw new Error(
          translate('syncService.hashDownload', { path: download.path }),
        );
      }
      await noteRepository.writeSyncFile(download.path, bytes);
      current += 1;
      onProgress?.({ phase: 'download', current, total });
    }

    if (plan.downloads.length > 0) {
      await notesStore.loadAll(true);
    }

    return {
      uploaded: plan.uploads.length,
      downloaded: plan.downloads.length,
      skipped: plan.skipped,
      conflicts: plan.conflicts,
      skippedLarge: local.skippedLarge,
    };
  } finally {
    transport.close();
  }
}
