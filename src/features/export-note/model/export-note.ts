/**
 * @fileoverview Экспорт одной заметки с вложениями в ZIP.
 */

import JSZip from 'jszip';

import { noteRepository } from '@/entities/note/api/note-repository';
import type { Note } from '@/entities/note/model/note-types';
import { downloadBlob } from '@/shared/lib/download';
import { translate } from '@/shared/i18n';

function archiveName(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return `${safe || 'note'}.zip`;
}

export async function exportNoteArchive(note: Note): Promise<void> {
  const files = await noteRepository.collectNoteFiles(note);
  const documentPath = `${note.filePath}.md`;
  if (!files.some(file => file.path === documentPath)) {
    throw new Error(translate('errors.documentFileMissing'));
  }

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.file, {
      date: new Date(file.file.lastModified || Date.now()),
    });
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  downloadBlob(blob, archiveName(note.title));
}
