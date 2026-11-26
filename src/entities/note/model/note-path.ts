/**
 * @fileoverview Утилиты для работы с путями документов.
 *
 * Путь документа — это путь markdown-файла относительно корня хранилища без
 * расширения `.md`, например `FABIA/Замена ГРМ/Замена ГРМ`.
 */

import { translate } from '@/shared/i18n';

export const DOCUMENT_EXTENSION = '.md';

export function isMarkdownFileName(name: string): boolean {
  return name.toLowerCase().endsWith(DOCUMENT_EXTENSION);
}

export function stripDocumentExtension(name: string): string {
  return isMarkdownFileName(name)
    ? name.slice(0, -DOCUMENT_EXTENSION.length)
    : name;
}

export function documentTitle(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] ?? path;
}

export function documentDirPath(path: string): string {
  const segments = path.split('/');
  segments.pop();
  return segments.join('/');
}

export function parentDirPath(dirPath: string): string {
  const segments = dirPath.split('/').filter(Boolean);
  segments.pop();
  return segments.join('/');
}

export function pathSegments(path: string): readonly string[] {
  return path.split('/').filter(Boolean);
}

export function joinPath(...segments: readonly string[]): string {
  return segments.filter(Boolean).join('/');
}

/**
 * Проверяет заголовок документа. Заголовок одновременно является именем
 * директории и файла, поэтому не должен содержать разделители пути.
 *
 * @returns Текст ошибки или null, если заголовок корректен.
 */
export function validateDocumentTitle(title: string): string | null {
  const value = title.trim();
  if (!value) {
    return translate('validation.titleRequired');
  }
  if (value.length > 120) {
    return translate('validation.titleTooLong');
  }
  if (/[/\\]/.test(value)) {
    return translate('validation.titleSlash');
  }
  if (/[<>:"|?*\p{Cc}]/u.test(value)) {
    return translate('validation.titleSymbols');
  }
  if (value === '.' || value === '..') {
    return translate('validation.titleInvalid');
  }
  if (value === 'create') {
    return translate('validation.titleReserved');
  }
  if (/^\.+$/.test(value)) {
    return translate('validation.titleInvalid');
  }
  if (/[. ]$/.test(value)) {
    return translate('validation.titleTrailing');
  }
  return null;
}

/** Приводит произвольный ввод к безопасному имени файла ассета. */
export function sanitizeAssetFileName(
  name: string,
  fallback = 'image',
): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const normalized = base
    .normalize('NFC')
    .replace(/[<>:"|?*\p{Cc}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(-120);

  return normalized || fallback;
}

/**
 * Разрешает путь из синтаксиса `@{путь_до_документа}` относительно текущего
 * документа.
 */
export function normalizeDocumentLinkPath(
  rawPath: string,
  fromDirPath: string,
): string {
  let value = rawPath.trim();
  if (!value) {
    return '';
  }

  try {
    value = decodeURIComponent(value);
  } catch {
    // Оставляем исходное значение, если оно не является URL-кодированным.
  }

  value = value.replace(/^\/+/, '');
  if (value.toLowerCase().endsWith(DOCUMENT_EXTENSION)) {
    value = value.slice(0, -DOCUMENT_EXTENSION.length);
  }

  const segments = value.split('/').filter(Boolean);
  const base =
    value.startsWith('./') || value.startsWith('../')
      ? fromDirPath.split('/').filter(Boolean)
      : [];
  const stack = [...base];

  for (const segment of segments) {
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  return stack.join('/');
}

export function validateAssetRelativePath(src: string): string[] | null {
  const value = src.split(/[?#]/)[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }

  const segments = decoded.split('/').filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some(segment => segment === '..' || segment === '.')
  ) {
    return null;
  }
  return segments;
}
