/**
 * @fileoverview Хранилище документов в OPFS.
 *
 * Новый документ хранится в стабильной директории с уникальным id:
 * `<id>/<id>.md`, изображения — в `<id>/assets`. Публичный путь (URL и
 * ссылки) хранится в frontmatter и не совпадает с путём хранения.
 */

import {
  collectFiles,
  copyDirectory,
  getDirectory,
  getDirectoryIfExists,
  getFileIfExists,
  getStorageRoot,
  isNotFoundError,
  removeDirectory,
  removeFile,
  writeBlob,
  writeFileText,
} from '@/entities/note/api/opfs';
import {
  normalizeTags,
  parseMarkdownDocument,
  serializeMarkdownDocument,
} from '@/entities/note/model/note-markdown';
import {
  DOCUMENT_EXTENSION,
  documentDirPath,
  isMarkdownFileName,
  joinPath,
  sanitizeAssetFileName,
  validateAssetRelativePath,
  validateDocumentTitle,
} from '@/entities/note/model/note-path';
import type {
  Note,
  NoteDraft,
  NoteState,
  PendingAsset,
} from '@/entities/note/model/note-types';
import { toIsoDate, toOptionalIsoDate } from '@/shared/lib/date';
import { sha256Hex } from '@/shared/lib/hash';
import { translate } from '@/shared/i18n';

const LEGACY_ARCHIVE_TAG = 'Архив';

export class DocumentValidationError extends Error {
  override name = 'DocumentValidationError';
}

export class DocumentExistsError extends Error {
  override name = 'DocumentExistsError';
}

export class DocumentNotFoundError extends Error {
  override name = 'DocumentNotFoundError';

  constructor(path: string) {
    super(translate('errors.documentNotFound', { path }));
  }
}

interface ReadMarkdownFile {
  readonly text: string;
  readonly hash: string;
  readonly lastModified: number;
}

async function readMarkdownFile(
  fileHandle: FileSystemFileHandle,
): Promise<ReadMarkdownFile> {
  const file = await fileHandle.getFile();
  const buffer = await file.arrayBuffer();
  return {
    text: new TextDecoder().decode(buffer),
    hash: await sha256Hex(buffer),
    lastModified: file.lastModified,
  };
}

function newStorageId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function normalizePublicPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const path = value.trim().replace(/^\/+|\/+$/g, '');
  if (!path) {
    return fallback;
  }
  const segments = path.split('/');
  if (
    segments.some(
      segment =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\\'),
    )
  ) {
    return fallback;
  }
  return path;
}

function legacyPublicPath(
  segments: readonly string[],
  fileTitle: string,
): string {
  const directoryPath = segments.join('/');
  const filePath = joinPath(directoryPath, fileTitle);
  const ownDirectory =
    segments.length > 0 && segments[segments.length - 1] === fileTitle;
  return ownDirectory ? directoryPath : filePath;
}

function buildNote(
  id: string,
  filePath: string,
  dirPath: string,
  raw: string,
  lastModified: number,
  hash: string,
  fallbackPath: string,
): Note {
  const parsed = parseMarkdownDocument(raw, fallbackPath);
  const path = normalizePublicPath(parsed.frontmatter['path'], fallbackPath);
  const modifiedDate = new Date(lastModified).toISOString();
  const hasCreated = Object.prototype.hasOwnProperty.call(
    parsed.frontmatter,
    'created',
  );
  const createdValue = parsed.frontmatter['created'];
  const createdAt = hasCreated
    ? createdValue
      ? toIsoDate(createdValue, new Date(modifiedDate))
      : ''
    : toIsoDate(undefined, new Date(modifiedDate));
  const updatedAt = toIsoDate(
    parsed.frontmatter['updated'],
    new Date(modifiedDate),
  );
  const hasUpdated = Object.prototype.hasOwnProperty.call(
    parsed.frontmatter,
    'updated',
  );
  const modifiedAt =
    hasUpdated && parsed.frontmatter['updated']
      ? createdAt && updatedAt === createdAt
        ? ''
        : updatedAt
      : '';
  const dueAt = toOptionalIsoDate(parsed.frontmatter['due']);
  const storedTags = normalizeTags(parsed.frontmatter['tags']);
  const legacyArchived = storedTags.includes(LEGACY_ARCHIVE_TAG);
  const state: NoteState =
    parsed.frontmatter['state'] === 'archived' || legacyArchived
      ? 'archived'
      : 'active';
  const tags = storedTags.filter(tag => tag !== LEGACY_ARCHIVE_TAG);
  const imported =
    parsed.frontmatter['imported'] === true ||
    parsed.frontmatter['imported'] === 'true';

  return {
    id,
    path,
    filePath,
    dirPath,
    title: parsed.title,
    createdAt,
    updatedAt,
    modifiedAt,
    dueAt,
    state,
    imported,
    hash,
    tags,
    body: parsed.body,
    frontmatter: parsed.frontmatter,
  };
}

function buildFrontmatter(
  note: Pick<Note, 'id' | 'frontmatter' | 'createdAt'>,
  dueAt: string,
  state: NoteState,
  tags: readonly string[],
  now: string,
  title: string,
  path: string,
): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    ...note.frontmatter,
    id: note.id,
    title,
    path,
    created: note.createdAt,
    updated: now,
  };
  delete frontmatter['imported'];
  if (dueAt) {
    frontmatter['due'] = dueAt;
  } else {
    delete frontmatter['due'];
  }
  if (state === 'archived') {
    frontmatter['state'] = 'archived';
  } else {
    delete frontmatter['state'];
  }
  const visibleTags = tags.filter(tag => tag !== LEGACY_ARCHIVE_TAG);
  if (visibleTags.length > 0) {
    frontmatter['tags'] = [...visibleTags];
  } else {
    delete frontmatter['tags'];
  }
  return frontmatter;
}

function splitPath(path: string): {
  readonly dir: readonly string[];
  readonly name: string;
} {
  const segments = path.split('/').filter(Boolean);
  const name = segments.pop() ?? '';
  return { dir: segments, name };
}

async function ensureUniqueAssetName(
  assets: FileSystemDirectoryHandle,
  requestedName: string,
): Promise<string> {
  const fileName = sanitizeAssetFileName(requestedName);
  if ((await getFileIfExists(assets, fileName)) === null) {
    return fileName;
  }

  const dotIndex = fileName.lastIndexOf('.');
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';

  for (let index = 1; index < 1_000; index += 1) {
    const candidate = `${base}-${index}${extension}`;
    if ((await getFileIfExists(assets, candidate)) === null) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}${extension}`;
}

interface StoredMarkdownEntry {
  readonly segments: readonly string[];
  readonly name: string;
  readonly handle: FileSystemFileHandle;
}

async function collectMarkdownEntries(
  directory: FileSystemDirectoryHandle,
  segments: readonly string[] = [],
  entries: StoredMarkdownEntry[] = [],
): Promise<StoredMarkdownEntry[]> {
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind === 'file') {
      if (isMarkdownFileName(name)) {
        entries.push({ segments, name, handle });
      }
      continue;
    }
    if (name === 'assets') {
      continue;
    }
    await collectMarkdownEntries(handle, [...segments, name], entries);
  }
  return entries;
}

async function migrateLegacyNotes(
  root: FileSystemDirectoryHandle,
): Promise<void> {
  const entries = await collectMarkdownEntries(root);

  for (const entry of entries) {
    const read = await readMarkdownFile(entry.handle);
    const fallbackTitle = entry.name.slice(0, -DOCUMENT_EXTENSION.length);
    const parsed = parseMarkdownDocument(read.text, fallbackTitle);
    const storedId =
      typeof parsed.frontmatter['id'] === 'string'
        ? parsed.frontmatter['id'].trim()
        : '';
    const conventional =
      storedId.length > 0 &&
      entry.segments.length === 1 &&
      entry.segments[0] === storedId &&
      entry.name === `${storedId}${DOCUMENT_EXTENSION}`;
    if (conventional) {
      continue;
    }

    const existingIdDirectory = storedId
      ? await getDirectoryIfExists(root, [storedId])
      : null;
    const id = storedId && !existingIdDirectory ? storedId : newStorageId();
    const fallbackPath = legacyPublicPath(entry.segments, fallbackTitle);
    const path = normalizePublicPath(parsed.frontmatter['path'], fallbackPath);
    const legacyDirectory = await getDirectory(root, entry.segments, false);
    let createdDirectory = false;

    try {
      const directory = await root.getDirectoryHandle(id, { create: true });
      createdDirectory = true;
      const fileHandle = await directory.getFileHandle(
        `${id}${DOCUMENT_EXTENSION}`,
        { create: true },
      );
      await writeFileText(
        fileHandle,
        serializeMarkdownDocument(
          parsed.title,
          {
            ...parsed.frontmatter,
            id,
            title: parsed.title,
            path,
          },
          parsed.body,
        ),
      );

      const legacyAssets = await getDirectoryIfExists(legacyDirectory, [
        'assets',
      ]);
      if (legacyAssets) {
        const assets = await directory.getDirectoryHandle('assets', {
          create: true,
        });
        await copyDirectory(legacyAssets, assets);
      }
      await removeFile(legacyDirectory, entry.name);
    } catch {
      if (createdDirectory) {
        await removeDirectory(root, id);
      }
    }
  }
}

class NoteRepository {
  async list(): Promise<Note[]> {
    const root = await getStorageRoot();
    await migrateLegacyNotes(root);
    const notes: Note[] = [];

    const walk = async (
      directory: FileSystemDirectoryHandle,
      segments: readonly string[],
    ): Promise<void> => {
      for await (const [name, handle] of directory.entries()) {
        if (handle.kind === 'file') {
          if (!isMarkdownFileName(name)) {
            continue;
          }
          const read = await readMarkdownFile(handle);
          const fileTitle = name.slice(0, -DOCUMENT_EXTENSION.length);
          const directoryPath = segments.join('/');
          const filePath = joinPath(directoryPath, fileTitle);
          const fallbackPath = legacyPublicPath(segments, fileTitle);
          const parsed = parseMarkdownDocument(read.text, fallbackPath);
          const storedId =
            typeof parsed.frontmatter['id'] === 'string'
              ? parsed.frontmatter['id'].trim()
              : '';
          notes.push(
            buildNote(
              storedId || newStorageId(),
              filePath,
              directoryPath,
              read.text,
              read.lastModified,
              read.hash,
              fallbackPath,
            ),
          );
          continue;
        }
        if (name === 'assets') {
          continue;
        }
        await walk(handle, [...segments, name]);
      }
    };

    await walk(root, []);
    return notes;
  }

  async create(
    draft: NoteDraft,
    assets: readonly PendingAsset[] = [],
  ): Promise<Note> {
    const title = draft.title.trim();
    const validationError = validateDocumentTitle(title);
    if (validationError) {
      throw new DocumentValidationError(validationError);
    }

    const existingNotes = await this.list();
    if (existingNotes.some(note => note.path === title)) {
      throw new DocumentExistsError(
        translate('errors.documentExists', { title }),
      );
    }

    const root = await getStorageRoot();
    const id = newStorageId();
    const directory = await root.getDirectoryHandle(id, { create: true });
    const now = new Date().toISOString();
    const path = title;
    const dirPath = id;
    const filePath = joinPath(id, id);
    const frontmatter = buildFrontmatter(
      { id, frontmatter: {}, createdAt: now },
      draft.dueAt ?? '',
      draft.state ?? 'active',
      normalizeTags(draft.tags),
      now,
      title,
      path,
    );
    const fileHandle = await directory.getFileHandle(
      `${id}${DOCUMENT_EXTENSION}`,
      { create: true },
    );
    await writeFileText(
      fileHandle,
      serializeMarkdownDocument(title, frontmatter, draft.body),
    );

    for (const asset of assets) {
      await this.writeAsset(id, asset.file, asset.fileName);
    }

    const read = await readMarkdownFile(fileHandle);
    return buildNote(
      id,
      filePath,
      dirPath,
      read.text,
      read.lastModified,
      read.hash,
      path,
    );
  }

  async update(note: Note, draft: NoteDraft): Promise<Note> {
    const title = draft.title.trim();
    const validationError = validateDocumentTitle(title);
    if (validationError) {
      throw new DocumentValidationError(validationError);
    }

    const parent = documentDirPath(note.path);
    const path = parent ? joinPath(parent, title) : title;
    const existingNotes = await this.list();
    if (existingNotes.some(item => item.id !== note.id && item.path === path)) {
      throw new DocumentExistsError(
        translate('errors.documentExists', { title }),
      );
    }

    const root = await getStorageRoot();
    const { dir, name } = splitPath(note.filePath);
    const directory = await getDirectoryIfExists(root, dir);
    if (!directory) {
      throw new DocumentNotFoundError(note.path);
    }
    const fileHandle = await getFileIfExists(
      directory,
      `${name}${DOCUMENT_EXTENSION}`,
    );
    if (!fileHandle) {
      throw new DocumentNotFoundError(note.path);
    }

    const now = new Date().toISOString();
    const frontmatter = buildFrontmatter(
      note,
      draft.dueAt ?? '',
      draft.state ?? note.state,
      normalizeTags(draft.tags),
      now,
      title,
      path,
    );
    await writeFileText(
      fileHandle,
      serializeMarkdownDocument(title, frontmatter, draft.body),
    );

    const read = await readMarkdownFile(fileHandle);
    return buildNote(
      note.id,
      note.filePath,
      note.dirPath,
      read.text,
      read.lastModified,
      read.hash,
      path,
    );
  }

  async updateBody(note: Note, body: string): Promise<Note> {
    const root = await getStorageRoot();
    const { dir, name } = splitPath(note.filePath);
    const directory = await getDirectoryIfExists(root, dir);
    if (!directory) {
      throw new DocumentNotFoundError(note.path);
    }
    const fileHandle = await getFileIfExists(
      directory,
      `${name}${DOCUMENT_EXTENSION}`,
    );
    if (!fileHandle) {
      throw new DocumentNotFoundError(note.path);
    }

    const now = new Date().toISOString();
    const frontmatter = buildFrontmatter(
      note,
      note.dueAt,
      note.state,
      note.tags,
      now,
      note.title,
      note.path,
    );
    await writeFileText(
      fileHandle,
      serializeMarkdownDocument(note.title, frontmatter, body),
    );

    const read = await readMarkdownFile(fileHandle);
    return buildNote(
      note.id,
      note.filePath,
      note.dirPath,
      read.text,
      read.lastModified,
      read.hash,
      note.path,
    );
  }

  /**
   * Сохраняет изображение в `<dirPath>/assets` и возвращает относительный путь
   * для markdown: `assets/<имя>`.
   */
  async writeAsset(
    dirPath: string,
    file: File,
    preferredName = file.name,
  ): Promise<string> {
    const root = await getStorageRoot();
    const directory = await getDirectory(
      root,
      dirPath.split('/').filter(Boolean),
      true,
    );
    const assets = await directory.getDirectoryHandle('assets', {
      create: true,
    });
    const fileName = await ensureUniqueAssetName(assets, preferredName);
    const fileHandle = await assets.getFileHandle(fileName, { create: true });
    await writeBlob(fileHandle, file);
    return `assets/${fileName}`;
  }

  async resolveAssetUrl(
    dirPath: string,
    source: string,
  ): Promise<string | null> {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source)) {
      return source;
    }

    const segments = validateAssetRelativePath(source);
    if (!segments) {
      return null;
    }

    const root = await getStorageRoot();
    const base = source.startsWith('/')
      ? []
      : dirPath.split('/').filter(Boolean);
    try {
      const directory = await getDirectory(
        root,
        [...base, ...segments.slice(0, -1)],
        false,
      );
      const fileName = segments[segments.length - 1] ?? '';
      const fileHandle = await getFileIfExists(directory, fileName);
      if (!fileHandle) {
        return null;
      }
      return URL.createObjectURL(await fileHandle.getFile());
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async hasFile(path: string): Promise<boolean> {
    const root = await getStorageRoot();
    const { dir, name } = splitPath(path);
    const directory = await getDirectoryIfExists(root, dir);
    if (!directory) {
      return false;
    }
    return (await getFileIfExists(directory, name)) !== null;
  }

  async hasDirectory(path: string): Promise<boolean> {
    const root = await getStorageRoot();
    return (
      (await getDirectoryIfExists(root, path.split('/').filter(Boolean))) !==
      null
    );
  }

  async collectNoteFiles(
    note: Note,
  ): Promise<{ readonly path: string; readonly file: File }[]> {
    const files = await this.listAllFiles();
    const documentPath = `${note.filePath}${DOCUMENT_EXTENSION}`;
    const assetPrefix = note.dirPath ? `${note.dirPath}/assets/` : 'assets/';
    return files
      .filter(
        file => file.path === documentPath || file.path.startsWith(assetPrefix),
      )
      .sort((first, second) => first.path.localeCompare(second.path));
  }

  async writeSyncFile(path: string, bytes: Uint8Array): Promise<void> {
    const segments = path.split('/').filter(Boolean);
    const fileName = segments.pop() ?? '';
    if (
      !fileName ||
      segments.some(segment => segment === '.' || segment === '..') ||
      path.includes('\\')
    ) {
      throw new DocumentValidationError(translate('errors.invalidSyncPath'));
    }

    const root = await getStorageRoot();
    const directory = await getDirectory(root, segments, true);
    const fileHandle = await directory.getFileHandle(fileName, {
      create: true,
    });
    await writeBlob(fileHandle, new Blob([Uint8Array.from(bytes)]));
  }

  async listAllFiles(): Promise<
    { readonly path: string; readonly file: File }[]
  > {
    const root = await getStorageRoot();
    return collectFiles(root);
  }
}

export const noteRepository = new NoteRepository();
