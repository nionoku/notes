/**
 * @fileoverview Формирование и разбор ссылки «Поделиться заметкой».
 *
 * Ссылка имеет вид `/shared?note=<base64url>`; внутри — JSON с полями заметки
 * и base64-содержимым её вложений.
 */

import { noteRepository } from '@/entities/note/api/note-repository';
import { normalizeTags } from '@/entities/note/model/note-markdown';
import { validateDocumentTitle } from '@/entities/note/model/note-path';
import type {
  Note,
  NoteDraft,
  PendingAsset,
} from '@/entities/note/model/note-types';
import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
} from '@/shared/lib/base64';
import { toOptionalIsoDate } from '@/shared/lib/date';
import { translate } from '@/shared/i18n';
import { sharedNoteUrl } from '@/shared/lib/urls';

export const SHARE_VERSION = 1;
/** Предупреждаем, что такой длинный URL могут обрезать браузер или мессенджер. */
export const SHARE_URL_WARNING_LENGTH = 1_500_000;
/** Жёсткий предел, чтобы не строить и не разбирать гигантские строки. */
export const SHARE_URL_MAX_LENGTH = 12_000_000;
/** Предел суммы вложений до base64-раздутия. */
export const SHARE_ASSETS_MAX_BYTES = 8 * 1024 * 1024;

const MAX_ASSETS = 1_000;

export interface SharedNoteAsset {
  /** Путь относительно `assets/`, например `photo.jpg` или `sub/photo.jpg`. */
  readonly path: string;
  readonly type: string;
  /** Обычный base64 байтов файла. */
  readonly data: string;
}

export interface SharedNotePayload {
  readonly version: typeof SHARE_VERSION;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly dueAt: string;
  readonly assets: readonly SharedNoteAsset[];
}

export interface SharedNoteImport {
  readonly draft: NoteDraft;
  readonly assets: readonly PendingAsset[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function invalidLink(cause?: unknown): Error {
  return new Error(translate('importNote.invalidLink'), { cause });
}

function isBase64(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

function isSafeAssetPath(path: string): boolean {
  if (
    !path ||
    path.length > 1_024 ||
    path.startsWith('/') ||
    path.includes('\\')
  ) {
    return false;
  }
  return path
    .split('/')
    .every(
      segment =>
        segment.length > 0 &&
        segment.length <= 200 &&
        segment !== '.' &&
        segment !== '..' &&
        !/\p{Cc}/u.test(segment),
    );
}

function validateSharedNote(raw: unknown): SharedNotePayload {
  const record = asRecord(raw);
  if (!record) {
    throw invalidLink();
  }
  if (record['version'] !== SHARE_VERSION) {
    throw new Error(translate('importNote.unsupportedVersion'));
  }
  const rawTitle = record['title'];
  const rawBody = record['body'];
  if (typeof rawTitle !== 'string' || typeof rawBody !== 'string') {
    throw invalidLink();
  }

  const title = rawTitle.trim();
  if (validateDocumentTitle(title)) {
    throw new Error(translate('importNote.invalidTitle'));
  }

  const rawTags = record['tags'];
  if (
    !Array.isArray(rawTags) ||
    !rawTags.every(tag => typeof tag === 'string')
  ) {
    throw invalidLink();
  }
  const tags = normalizeTags(rawTags).filter(tag => tag.length <= 50);

  const rawAssets = record['assets'];
  if (!Array.isArray(rawAssets) || rawAssets.length > MAX_ASSETS) {
    throw invalidLink();
  }

  const assets: SharedNoteAsset[] = [];
  const paths = new Set<string>();
  for (const item of rawAssets) {
    const asset = asRecord(item);
    if (
      !asset ||
      typeof asset['path'] !== 'string' ||
      typeof asset['type'] !== 'string' ||
      typeof asset['data'] !== 'string'
    ) {
      throw invalidLink();
    }
    if (
      !isSafeAssetPath(asset['path']) ||
      paths.has(asset['path']) ||
      !isBase64(asset['data'])
    ) {
      throw new Error(translate('importNote.invalidAsset'));
    }
    paths.add(asset['path']);
    assets.push({
      path: asset['path'],
      type: asset['type'],
      data: asset['data'],
    });
  }

  return {
    version: SHARE_VERSION,
    title,
    body: rawBody,
    tags,
    dueAt: toOptionalIsoDate(record['dueAt']),
    assets,
  };
}

/**
 * Читает заметку и её вложения в структуру для ссылки.
 * Вложения берутся из `<dirPath>/assets/` с сохранением относительных путей.
 */
export async function buildSharedNotePayload(
  note: Note,
): Promise<SharedNotePayload> {
  if (validateDocumentTitle(note.title)) {
    throw new Error(translate('shareNote.invalidTitle'));
  }

  const files = await noteRepository.collectNoteFiles(note);
  const prefix = note.dirPath ? `${note.dirPath}/assets/` : 'assets/';
  const assets: SharedNoteAsset[] = [];
  let totalBytes = 0;

  for (const file of files) {
    if (!file.path.startsWith(prefix)) {
      continue;
    }
    const path = file.path.slice(prefix.length);
    if (!isSafeAssetPath(path)) {
      throw new Error(translate('shareNote.invalidAsset'));
    }
    totalBytes += file.file.size;
    if (totalBytes > SHARE_ASSETS_MAX_BYTES) {
      throw new Error(translate('shareNote.tooLarge'));
    }
    const bytes = new Uint8Array(await file.file.arrayBuffer());
    assets.push({
      path,
      type: file.file.type,
      data: bytesToBase64(bytes),
    });
  }

  return {
    version: SHARE_VERSION,
    title: note.title,
    body: note.body,
    tags: [...note.tags],
    dueAt: note.dueAt,
    assets,
  };
}

export function encodeSharedNote(payload: SharedNotePayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/** Разбирает значение query-параметра `note`; принимает base64url и base64. */
export function decodeSharedNote(encoded: string): SharedNotePayload {
  if (!encoded) {
    throw new Error(translate('importNote.missing'));
  }
  if (encoded.length > SHARE_URL_MAX_LENGTH) {
    throw new Error(translate('importNote.tooLarge'));
  }

  let text: string;
  try {
    const bytes = base64UrlToBytes(encoded);
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw invalidLink(error);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw invalidLink(error);
  }

  return validateSharedNote(raw);
}

/** Готовит черновик и вложения для `notesStore.create`. */
export function prepareSharedNoteImport(
  payload: SharedNotePayload,
): SharedNoteImport {
  const assets = payload.assets.map(asset => {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = new Uint8Array(base64ToBytes(asset.data));
    } catch (error) {
      throw new Error(translate('importNote.invalidAsset'), { cause: error });
    }
    const fileName = asset.path.split('/').pop() ?? '';
    return {
      fileName,
      relativePath: asset.path,
      file: new File([bytes.buffer], fileName, {
        type: asset.type || 'application/octet-stream',
      }),
    };
  });

  return {
    draft: {
      title: payload.title,
      tags: [...payload.tags],
      body: payload.body,
      dueAt: payload.dueAt,
    },
    assets,
  };
}

/** «Заголовок (копия)» / «Заголовок (копия 2)» с учётом лимита заголовка. */
export function sharedCopyTitle(title: string, attempt: number): string {
  const suffix =
    attempt <= 1
      ? translate('importNote.copySuffix')
      : translate('importNote.copySuffixNumbered', { number: attempt });
  const maxStem = Math.max(1, 120 - suffix.length);
  const stem = title
    .slice(0, maxStem)
    .replace(/[. ]+$/u, '')
    .trim();
  return `${stem || translate('importNote.fallbackTitle')}${suffix}`;
}

/** Собирает абсолютную ссылку для отправки. */
export async function createShareLink(note: Note): Promise<string> {
  const payload = await buildSharedNotePayload(note);
  const link = new URL(
    sharedNoteUrl(encodeSharedNote(payload)),
    window.location.origin,
  ).href;
  if (link.length > SHARE_URL_MAX_LENGTH) {
    throw new Error(translate('shareNote.tooLarge'));
  }
  return link;
}
