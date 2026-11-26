/**
 * @fileoverview Импорт markdown и ZIP-архивов в OPFS.
 */

import JSZip from 'jszip';

import { noteRepository } from '@/entities/note/api/note-repository';
import { translate } from '@/shared/i18n';
import {
  parseMarkdownDocument,
  serializeMarkdownDocument,
} from '@/entities/note/model/note-markdown';
import {
  sanitizeAssetFileName,
  validateDocumentTitle,
} from '@/entities/note/model/note-path';

export interface ImportSummary {
  readonly documents: number;
  readonly files: number;
  readonly skipped: number;
}

interface MarkdownImport {
  readonly raw: string;
  readonly targetFilePath: string;
  readonly metadataDate: Date | number | undefined;
}

const encoder = new TextEncoder();

function isoFromValue(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    if (typeof value === 'string' && value.trim() === '') {
      return '';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  return '';
}

function resolveCreated(
  value: unknown,
  metadataDate: Date | number | undefined,
): string {
  const fromMarkdown = isoFromValue(value);
  if (fromMarkdown) {
    return fromMarkdown;
  }
  if (metadataDate instanceof Date) {
    return Number.isNaN(metadataDate.getTime())
      ? ''
      : metadataDate.toISOString();
  }
  if (typeof metadataDate === 'number' && metadataDate > 0) {
    const date = new Date(metadataDate);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  return '';
}

async function writeMarkdown(imported: MarkdownImport): Promise<void> {
  const documentPath = imported.targetFilePath.replace(/\.md$/i, '');
  const parsed = parseMarkdownDocument(imported.raw, documentPath);
  const frontmatter = {
    ...parsed.frontmatter,
    imported: true,
    created: resolveCreated(
      parsed.frontmatter['created'],
      imported.metadataDate,
    ),
  };
  const serialized = serializeMarkdownDocument(
    documentPath,
    frontmatter,
    parsed.body,
  );
  await noteRepository.writeSyncFile(
    imported.targetFilePath,
    encoder.encode(serialized),
  );
}

async function uniqueTitle(base: string): Promise<string> {
  const safeBase = sanitizeAssetFileName(
    base,
    translate('importNotes.fallbackTitle'),
  );
  const initial = validateDocumentTitle(safeBase)
    ? translate('importNotes.fallbackTitle')
    : safeBase;
  let candidate = initial;
  let attempt = 0;

  while (
    (await noteRepository.hasDirectory(candidate)) ||
    (await noteRepository.hasFile(`${candidate}.md`))
  ) {
    attempt += 1;
    candidate =
      attempt === 1
        ? translate('importNotes.importSuffix', { title: initial })
        : translate('importNotes.importSuffixNumbered', {
            title: initial,
            number: attempt,
          });
  }

  return candidate;
}

async function importMarkdownFile(
  file: File,
  summary: { documents: number; files: number; skipped: number },
): Promise<void> {
  const base = file.name.replace(/\.md$/i, '');
  const title = await uniqueTitle(base);
  const targetFilePath = `${title}/${title}.md`;
  await writeMarkdown({
    raw: await file.text(),
    targetFilePath,
    metadataDate: file.lastModified,
  });
  summary.documents += 1;
  summary.files += 1;
}

function safeArchivePath(name: string): string | null {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some(
      segment => segment === '.' || segment === '..' || /\p{Cc}/u.test(segment),
    )
  ) {
    return null;
  }
  return segments.join('/');
}

function shouldSkipArchivePath(path: string): boolean {
  const segments = path.split('/');
  return segments.some(
    segment =>
      segment === '__MACOSX' ||
      segment === '.DS_Store' ||
      segment === 'Thumbs.db' ||
      segment.startsWith('._'),
  );
}

async function uniqueArchivePrefix(base: string): Promise<string> {
  const safeBase = sanitizeAssetFileName(base, translate('importNotes.prefix'));
  let candidate = safeBase;
  let index = 1;
  while (await noteRepository.hasDirectory(candidate)) {
    index += 1;
    candidate = `${safeBase} ${index}`;
  }
  return candidate;
}

async function importArchive(
  file: File,
  summary: { documents: number; files: number; skipped: number },
): Promise<void> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files)
    .filter(entry => !entry.dir)
    .map(entry => ({ entry, path: safeArchivePath(entry.name) }))
    .filter(
      (item): item is { entry: JSZip.JSZipObject; path: string } =>
        item.path !== null && !shouldSkipArchivePath(item.path),
    );

  let prefix = '';
  for (const item of entries) {
    if (await noteRepository.hasFile(item.path)) {
      prefix = await uniqueArchivePrefix(file.name.replace(/\.zip$/i, ''));
      break;
    }
  }

  for (const { entry, path } of entries) {
    const target = prefix ? `${prefix}/${path}` : path;
    if (/\.md$/i.test(path)) {
      await writeMarkdown({
        raw: await entry.async('string'),
        targetFilePath: target,
        metadataDate: entry.date,
      });
      summary.documents += 1;
    } else {
      await noteRepository.writeSyncFile(
        target,
        await entry.async('uint8array'),
      );
    }
    summary.files += 1;
  }
}

export async function importNotes(
  files: readonly File[],
): Promise<ImportSummary> {
  const summary = { documents: 0, files: 0, skipped: 0 };

  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      try {
        await importArchive(file, summary);
      } catch (error) {
        throw new Error(
          translate('importNotes.archiveError', {
            name: file.name,
            reason:
              error instanceof Error
                ? error.message
                : translate('importNotes.corruptArchive'),
          }),
          { cause: error },
        );
      }
      continue;
    }
    if (/\.md$/i.test(file.name)) {
      await importMarkdownFile(file, summary);
      continue;
    }
    summary.skipped += 1;
  }

  return summary;
}
