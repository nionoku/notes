/**
 * @fileoverview Низкоуровневые операции с Origin Private File System.
 */

import {translate} from '@/shared/i18n';

export interface StoredFile {
  readonly path: string;
  readonly file: File;
}

let rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.getDirectory === 'function'
  );
}

export async function getStorageRoot(): Promise<FileSystemDirectoryHandle> {
  if (!isOpfsSupported()) {
    throw new Error(translate('errors.opfsUnsupported'));
  }
  rootPromise ??= navigator.storage.getDirectory();
  try {
    return await rootPromise;
  } catch (error) {
    rootPromise = null;
    throw error;
  }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

export function isTypeMismatchError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TypeMismatchError';
}

export async function getDirectory(
  parent: FileSystemDirectoryHandle,
  segments: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let current = parent;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, {create});
  }
  return current;
}

export async function getDirectoryIfExists(
  parent: FileSystemDirectoryHandle,
  segments: readonly string[],
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await getDirectory(parent, segments, false);
  } catch (error) {
    if (isNotFoundError(error) || isTypeMismatchError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getFileIfExists(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemFileHandle | null> {
  try {
    return await parent.getFileHandle(name);
  } catch (error) {
    if (isNotFoundError(error) || isTypeMismatchError(error)) {
      return null;
    }
    throw error;
  }
}

export async function readFileText(
  fileHandle: FileSystemFileHandle,
): Promise<string> {
  const file = await fileHandle.getFile();
  return file.text();
}

export async function writeFileText(
  fileHandle: FileSystemFileHandle,
  text: string,
): Promise<void> {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(text);
  } finally {
    await writable.close();
  }
}

export async function writeBlob(
  fileHandle: FileSystemFileHandle,
  blob: Blob,
): Promise<void> {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

export async function removeFile(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  try {
    await parent.removeEntry(name);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

export async function removeDirectory(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  try {
    await parent.removeEntry(name, {recursive: true});
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

/** Копирует директорию целиком, опционально переименовывая файл верхнего уровня. */
export async function copyDirectory(
  source: FileSystemDirectoryHandle,
  target: FileSystemDirectoryHandle,
  rename?: {readonly from: string; readonly to: string},
  depth = 0,
): Promise<void> {
  for await (const [name, handle] of source.entries()) {
    if (handle.kind === 'file') {
      const targetName =
        depth === 0 && rename && name === rename.from ? rename.to : name;
      const file = await handle.getFile();
      const fileHandle = await target.getFileHandle(targetName, {create: true});
      await writeBlob(fileHandle, file);
      continue;
    }

    const directory = await target.getDirectoryHandle(name, {create: true});
    await copyDirectory(handle, directory, rename, depth + 1);
  }
}

/** Обходит все файлы хранилища. */
export async function collectFiles(
  root: FileSystemDirectoryHandle,
): Promise<StoredFile[]> {
  const files: StoredFile[] = [];

  async function walk(
    directory: FileSystemDirectoryHandle,
    segments: readonly string[],
  ): Promise<void> {
    for await (const [name, handle] of directory.entries()) {
      const path = [...segments, name];
      if (handle.kind === 'file') {
        files.push({path: path.join('/'), file: await handle.getFile()});
      } else {
        await walk(handle, path);
      }
    }
  }

  await walk(root, []);
  return files;
}
