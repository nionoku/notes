/**
 * @fileoverview Типы синхронизации с Google Drive через Apps Script.
 */

export interface DriveConfig {
  readonly url: string;
  readonly token: string;
}

export type DriveSyncState =
  'not-configured' | 'idle' | 'syncing' | 'ready' | 'error' | 'offline';

export interface RemoteFile {
  readonly path: string;
  readonly hash: string;
  readonly size: number;
  readonly modified: number;
}

export interface RemoteManifest {
  readonly files: readonly RemoteFile[];
}

export interface LocalSyncFile {
  readonly path: string;
  readonly file: File;
  readonly hash: string;
  readonly size: number;
  readonly modified: number;
}

export interface SyncPlan {
  readonly uploads: readonly LocalSyncFile[];
  readonly downloads: readonly RemoteFile[];
  readonly skipped: number;
  readonly conflicts: number;
}

export interface SyncSummary {
  readonly uploaded: number;
  readonly downloaded: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly skippedLarge: number;
}

export interface SyncProgress {
  readonly phase: 'manifest' | 'upload' | 'download';
  readonly current: number;
  readonly total: number;
}

export interface UploadResult {
  readonly path: string;
  readonly hash: string;
  readonly size: number;
  readonly modified: number;
}

export interface DownloadResult {
  readonly path: string;
  readonly hash: string;
  readonly size: number;
  readonly modified: number;
  readonly base64: string;
}
