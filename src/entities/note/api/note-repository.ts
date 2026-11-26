/**
 * @fileoverview Хранилище документов в OPFS.
 *
 * Новый документ располагается в собственной директории:
 * `<Заголовок>/<Заголовок>.md`, изображения — в `<Заголовок>/assets`.
 * Публичный путь документа совпадает с директорией (`/Заголовок`), а
 * `filePath` хранит фактический путь markdown-файла.
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
  documentTitle,
  isMarkdownFileName,
  joinPath,
  parentDirPath,
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
import {toIsoDate, toOptionalIsoDate} from '@/shared/lib/date';
import {sha256Hex} from '@/shared/lib/hash';
import {translate} from '@/shared/i18n';

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
    super(translate('errors.documentNotFound', {path}));
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

function buildNote(
  path: string,
  filePath: string,
  dirPath: string,
  raw: string,
  lastModified: number,
  hash: string,
): Note {
  const parsed = parseMarkdownDocument(raw, path);
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
    path,
    filePath,
    dirPath,
    title: documentTitle(path),
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
  note: Pick<Note, 'frontmatter' | 'createdAt'>,
  dueAt: string,
  state: NoteState,
  tags: readonly string[],
  now: string,
): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    ...note.frontmatter,
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
  return {dir: segments, name};
}

function pathSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

async function directoryEntries(
  directory: FileSystemDirectoryHandle,
): Promise<[string, FileSystemHandle][]> {
  const entries: [string, FileSystemHandle][] = [];
  for await (const entry of directory.entries()) {
    entries.push(entry);
  }
  return entries;
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

class NoteRepository {
  async list(): Promise<Note[]> {
    const root = await getStorageRoot();
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
          const ownDirectory =
            segments.length > 0 && segments[segments.length - 1] === fileTitle;
          const path = ownDirectory ? directoryPath : filePath;
          notes.push(
            buildNote(
              path,
              filePath,
              directoryPath,
              read.text,
              read.lastModified,
              read.hash,
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

    const root = await getStorageRoot();
    const existingDirectory = await getDirectoryIfExists(root, [title]);
    if (
      !existingDirectory &&
      (await getFileIfExists(root, `${title}${DOCUMENT_EXTENSION}`))
    ) {
      throw new DocumentExistsError(
        translate('errors.documentExists', {title}),
      );
    }
    if (existingDirectory) {
      const entries = await directoryEntries(existingDirectory);
      const onlyDraftAssets =
        entries.length === 0 ||
        entries.every(
          ([name, handle]) => name === 'assets' && handle.kind === 'directory',
        );
      if (!onlyDraftAssets) {
        throw new DocumentExistsError(
          translate('errors.documentExists', {title}),
        );
      }
    }

    const directory =
      existingDirectory ??
      (await root.getDirectoryHandle(title, {create: true}));
    const now = new Date().toISOString();
    const path = title;
    const dirPath = title;
    const filePath = joinPath(title, title);
    const frontmatter = buildFrontmatter(
      {frontmatter: {}, createdAt: now},
      draft.dueAt ?? '',
      draft.state ?? 'active',
      normalizeTags(draft.tags),
      now,
    );
    const fileHandle = await directory.getFileHandle(
      `${title}${DOCUMENT_EXTENSION}`,
      {
        create: true,
      },
    );
    await writeFileText(
      fileHandle,
      serializeMarkdownDocument(path, frontmatter, draft.body),
    );

    for (const asset of assets) {
      await this.writeAsset(title, asset.file, asset.fileName);
    }

    const read = await readMarkdownFile(fileHandle);
    return buildNote(
      path,
      filePath,
      dirPath,
      read.text,
      read.lastModified,
      read.hash,
    );
  }

  async update(note: Note, draft: NoteDraft): Promise<Note> {
    const title = draft.title.trim();
    const validationError = validateDocumentTitle(title);
    if (validationError) {
      throw new DocumentValidationError(validationError);
    }

    const root = await getStorageRoot();
    const sameTitle = title === note.title;
    const ownDirectory = note.dirPath !== '' && note.path === note.dirPath;
    const oldDirectorySegments = pathSegments(note.dirPath);
    const oldDirectory = await getDirectory(root, oldDirectorySegments, false);
    let targetDirectory = oldDirectory;
    let targetPath = note.path;
    let targetFilePath = note.filePath;
    let targetDirPath = note.dirPath;
    let newDirectorySegments: readonly string[] | null = null;

    if (!sameTitle) {
      if (ownDirectory) {
        newDirectorySegments = [
          ...pathSegments(parentDirPath(note.dirPath)),
          title,
        ];
        const existing = await getDirectoryIfExists(root, newDirectorySegments);
        const newParent = await getDirectory(
          root,
          newDirectorySegments.slice(0, -1),
          false,
        );
        if (
          existing ||
          (await getFileIfExists(newParent, `${title}${DOCUMENT_EXTENSION}`))
        ) {
          throw new DocumentExistsError(
            translate('errors.documentExists', {title}),
          );
        }

        targetDirectory = await getDirectory(root, newDirectorySegments, true);
        targetDirPath = joinPath(...newDirectorySegments);
        targetPath = targetDirPath;
        targetFilePath = joinPath(targetDirPath, title);
      } else {
        targetDirPath = note.dirPath;
        targetPath = joinPath(note.dirPath, title);
        targetFilePath = targetPath;
        const targetName = `${title}${DOCUMENT_EXTENSION}`;
        if (await getFileIfExists(targetDirectory, targetName)) {
          throw new DocumentExistsError(
            translate('errors.documentExists', {title}),
          );
        }
      }
    }

    const now = new Date().toISOString();
    const frontmatter = buildFrontmatter(
      note,
      draft.dueAt ?? '',
      draft.state ?? note.state,
      normalizeTags(draft.tags),
      now,
    );
    let fileHandle: FileSystemFileHandle;

    try {
      if (!sameTitle && ownDirectory) {
        await copyDirectory(oldDirectory, targetDirectory, {
          from: `${note.title}${DOCUMENT_EXTENSION}`,
          to: `${title}${DOCUMENT_EXTENSION}`,
        });
      }
      fileHandle = await targetDirectory.getFileHandle(
        `${title}${DOCUMENT_EXTENSION}`,
        {
          create: true,
        },
      );
      await writeFileText(
        fileHandle,
        serializeMarkdownDocument(targetPath, frontmatter, draft.body),
      );
    } catch (error) {
      if (newDirectorySegments) {
        const parent = await getDirectory(
          root,
          newDirectorySegments.slice(0, -1),
          false,
        );
        await removeDirectory(parent, title);
      }
      throw error;
    }

    if (!sameTitle) {
      if (ownDirectory) {
        const oldParent = await getDirectory(
          root,
          oldDirectorySegments.slice(0, -1),
          false,
        );
        const oldName =
          oldDirectorySegments[oldDirectorySegments.length - 1] ?? note.title;
        await removeDirectory(oldParent, oldName);
      } else {
        await removeFile(targetDirectory, `${note.title}${DOCUMENT_EXTENSION}`);
      }
    }

    const read = await readMarkdownFile(fileHandle);
    return buildNote(
      targetPath,
      targetFilePath,
      targetDirPath,
      read.text,
      read.lastModified,
      read.hash,
    );
  }

  async updateBody(note: Note, body: string): Promise<Note> {
    const root = await getStorageRoot();
    const {dir, name} = splitPath(note.filePath);
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
    );
    await writeFileText(
      fileHandle,
      serializeMarkdownDocument(note.path, frontmatter, body),
    );

    const read = await readMarkdownFile(fileHandle);
    return buildNote(
      note.path,
      note.filePath,
      note.dirPath,
      read.text,
      read.lastModified,
      read.hash,
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
    const assets = await directory.getDirectoryHandle('assets', {create: true});
    const fileName = await ensureUniqueAssetName(assets, preferredName);
    const fileHandle = await assets.getFileHandle(fileName, {create: true});
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
    const {dir, name} = splitPath(path);
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
  ): Promise<{readonly path: string; readonly file: File}[]> {
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
    const fileHandle = await directory.getFileHandle(fileName, {create: true});
    await writeBlob(fileHandle, new Blob([Uint8Array.from(bytes)]));
  }

  async listAllFiles(): Promise<
    {readonly path: string; readonly file: File}[]
  > {
    const root = await getStorageRoot();
    return collectFiles(root);
  }
}

export const noteRepository = new NoteRepository();
