/**
 * @fileoverview Транспорт к Google Apps Script через iframe-мост.
 *
 * Apps Script Web App не отдаёт CORS-заголовки для обычного fetch, поэтому
 * запросы идут через iframe, который использует google.script.run.
 */

import {translate} from '@/shared/i18n';
import type {
  DownloadResult,
  RemoteManifest,
  UploadResult,
} from '@/features/sync-drive/model/drive-types';

const APP_SOURCE = 'notes-app-bridge';
const BRIDGE_SOURCE = 'notes-drive-bridge';
const READY_TIMEOUT_MS = 25_000;
const REQUEST_TIMEOUT_MS = 120_000;

interface BridgeRequest {
  readonly method: string;
  readonly token: string;
  readonly params: Record<string, unknown>;
}

interface BridgeMessage {
  readonly source?: string;
  readonly type?: string;
  readonly id?: string;
  readonly ok?: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

export interface DriveTransport {
  manifest(): Promise<RemoteManifest>;
  upload(path: string, base64: string, hash: string): Promise<UploadResult>;
  download(path: string): Promise<DownloadResult>;
  close(): void;
}

export class AppsScriptTransport implements DriveTransport {
  private iframe: HTMLIFrameElement | null = null;
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private readyTimer: number | undefined;
  private readyPoll: number | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly handleMessage = (event: MessageEvent): void => {
    if (event.source !== this.iframe?.contentWindow) {
      return;
    }
    const message = event.data as BridgeMessage;
    if (!message || message.source !== BRIDGE_SOURCE) {
      return;
    }

    if (message.type === 'ready') {
      this.markReady();
      return;
    }

    if (!message.id) {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    window.clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(
        new Error(message.error || translate('syncTransport.appScriptError')),
      );
    }
  };

  private readonly url: string;
  private readonly token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  async manifest(): Promise<RemoteManifest> {
    return this.request<RemoteManifest>('manifest');
  }

  async upload(
    path: string,
    base64: string,
    hash: string,
  ): Promise<UploadResult> {
    return this.request<UploadResult>('upload', {path, base64, hash});
  }

  async download(path: string): Promise<DownloadResult> {
    return this.request<DownloadResult>('download', {path});
  }

  close(): void {
    this.destroy();
  }

  private async request<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    await this.ensureReady();
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(translate('syncTransport.timeout')));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timer,
      });
      const request: BridgeRequest = {method, token: this.token, params};
      this.iframe?.contentWindow?.postMessage(
        {source: APP_SOURCE, id, request},
        '*',
      );
    });
  }

  private ensureReady(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
      window.addEventListener('message', this.handleMessage);

      let target: URL;
      try {
        target = new URL(this.url);
        target.searchParams.set('action', 'bridge');
      } catch {
        this.failReady(new Error(translate('syncTransport.invalidUrl')));
        return;
      }

      const iframe = document.createElement('iframe');
      iframe.title = 'Google Drive sync bridge';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.tabIndex = -1;
      iframe.style.position = 'fixed';
      iframe.style.inset = '0';
      iframe.style.inlineSize = '1px';
      iframe.style.blockSize = '1px';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.src = target.toString();
      this.iframe = iframe;
      this.readyTimer = window.setTimeout(() => {
        this.failReady(new Error(translate('syncTransport.connect')));
      }, READY_TIMEOUT_MS);
      document.body.append(iframe);
      this.readyPoll = window.setInterval(() => {
        iframe.contentWindow?.postMessage(
          {source: APP_SOURCE, type: 'hello'},
          '*',
        );
      }, 1_000);
    });

    return this.readyPromise;
  }

  private markReady(): void {
    if (this.readyTimer !== undefined) {
      window.clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
    }
    if (this.readyPoll !== undefined) {
      window.clearInterval(this.readyPoll);
      this.readyPoll = undefined;
    }
    this.resolveReady?.();
    this.resolveReady = null;
    this.rejectReady = null;
  }

  private failReady(error: Error): void {
    if (this.readyTimer !== undefined) {
      window.clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
    }
    if (this.readyPoll !== undefined) {
      window.clearInterval(this.readyPoll);
      this.readyPoll = undefined;
    }
    this.rejectReady?.(error);
    this.resolveReady = null;
    this.rejectReady = null;
    this.destroy();
  }

  private destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    if (this.readyTimer !== undefined) {
      window.clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
    }
    if (this.readyPoll !== undefined) {
      window.clearInterval(this.readyPoll);
      this.readyPoll = undefined;
    }
    for (const [id, pending] of this.pending) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error(translate('syncTransport.closed')));
      this.pending.delete(id);
    }
    this.iframe?.remove();
    this.iframe = null;
    this.readyPromise = null;
  }
}
