/**
 * @fileoverview Состояние базы знаний.
 */

import {computed, ref} from 'vue';
import {defineStore} from 'pinia';

import {
  DocumentExistsError,
  DocumentNotFoundError,
  DocumentValidationError,
  noteRepository,
} from '@/entities/note/api/note-repository';
import {
  documentDirPath,
  joinPath,
  normalizeDocumentLinkPath,
} from '@/entities/note/model/note-path';
import {toggleTaskAt} from '@/entities/note/model/note-tasks';
import type {
  Note,
  NoteDraft,
  PendingAsset,
} from '@/entities/note/model/note-types';
import {extractHeadings, slugifyHeading} from '@/shared/lib/markdown-headings';
import type {ResolvedDocumentLink} from '@/shared/lib/markdown';
import {translate} from '@/shared/i18n';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export function describeError(error: unknown): string {
  if (
    error instanceof DocumentExistsError ||
    error instanceof DocumentValidationError ||
    error instanceof DocumentNotFoundError
  ) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return translate('errors.unknownStorage');
}

function normalizeAnchor(anchor: string): string {
  let value = anchor;
  try {
    value = decodeURIComponent(anchor);
  } catch {
    // Оставляем исходное значение, если оно не URL-кодировано.
  }
  return value.replace(/^#/, '').trim();
}

let loadPromise: Promise<void> | null = null;

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([]);
  const status = ref<LoadStatus>('idle');
  const error = ref<string | null>(null);

  const notesByPath = computed(() => {
    const index = new Map<string, Note>();
    for (const note of notes.value) {
      index.set(note.path, note);
    }
    return index;
  });

  const sortedNotes = computed(() =>
    [...notes.value].sort((first, second) => {
      const byDate =
        (Date.parse(second.createdAt) || 0) -
        (Date.parse(first.createdAt) || 0);
      if (byDate !== 0) {
        return byDate;
      }
      return first.title.localeCompare(second.title, 'ru');
    }),
  );

  const allTags = computed(() => {
    const tags = new Set<string>();
    for (const note of notes.value) {
      for (const tag of note.tags) {
        tags.add(tag);
      }
    }
    return [...tags].sort((first, second) => first.localeCompare(second, 'ru'));
  });

  const isEmpty = computed(
    () => status.value === 'ready' && notes.value.length === 0,
  );

  function getByPath(path: string): Note | undefined {
    return notesByPath.value.get(path);
  }

  async function loadAll(force = false): Promise<void> {
    if (!force && status.value === 'ready') {
      return;
    }
    if (loadPromise) {
      return loadPromise;
    }

    status.value = 'loading';
    error.value = null;
    loadPromise = (async () => {
      try {
        notes.value = await noteRepository.list();
        status.value = 'ready';
      } catch (loadError) {
        error.value = describeError(loadError);
        status.value = 'error';
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  }

  async function create(
    draft: NoteDraft,
    assets: readonly PendingAsset[] = [],
  ): Promise<Note> {
    const note = await noteRepository.create(draft, assets);
    notes.value = [
      ...notes.value.filter(item => item.path !== note.path),
      note,
    ];
    status.value = 'ready';
    return note;
  }

  async function setArchived(note: Note, archived: boolean): Promise<Note> {
    const state = archived ? 'archived' : 'active';
    if (note.state === state) {
      return note;
    }
    const updated = await noteRepository.update(note, {
      title: note.title,
      tags: note.tags,
      body: note.body,
      dueAt: note.dueAt,
      state,
    });
    notes.value = notes.value.map(item =>
      item.path === updated.path ? updated : item,
    );
    return updated;
  }

  async function save(note: Note, draft: NoteDraft): Promise<Note> {
    const previous = note;
    const updated = await noteRepository.update(note, draft);
    const directoryMoved =
      updated.path !== previous.path && updated.dirPath !== previous.dirPath;

    if (directoryMoved) {
      await loadAll(true);
    } else {
      notes.value = notes.value.map(item =>
        item.path === previous.path ? updated : item,
      );
    }

    return updated;
  }

  async function toggleTask(
    note: Note,
    taskIndex: number,
    checked: boolean,
  ): Promise<void> {
    const body = toggleTaskAt(note.body, taskIndex, checked);
    if (body === note.body) {
      return;
    }

    const updated = await noteRepository.updateBody(note, body);
    notes.value = notes.value.map(item =>
      item.path === updated.path ? updated : item,
    );
  }

  function resolveDocumentLink(
    rawPath: string,
    fromPath: string,
    anchor?: string,
  ): ResolvedDocumentLink | null {
    const current = notesByPath.value.get(fromPath);
    const fromDir = current?.dirPath ?? documentDirPath(fromPath);
    const normalized = normalizeDocumentLinkPath(rawPath, fromDir);
    if (!normalized) {
      return null;
    }

    const linked = (note: Note, exists = true): ResolvedDocumentLink => {
      let anchorTitle: string | undefined;
      if (anchor) {
        const normalizedAnchor = normalizeAnchor(anchor);
        const headings = extractHeadings(note.body);
        const heading = headings.find(
          item =>
            item.slug === normalizedAnchor ||
            item.text.toLocaleLowerCase('ru') ===
              normalizedAnchor.toLocaleLowerCase('ru') ||
            item.slug === slugifyHeading(normalizedAnchor),
        );
        anchorTitle = heading?.text;
      }
      return {
        path: note.path,
        title: note.title,
        exists,
        anchorTitle,
      };
    };

    const direct = notesByPath.value.get(normalized);
    if (direct) {
      return linked(direct);
    }

    const relative = joinPath(fromDir, normalized);
    const relativeMatch = notesByPath.value.get(relative);
    if (relativeMatch) {
      return linked(relativeMatch);
    }

    const target = normalized.toLocaleLowerCase('ru');
    const caseInsensitive = notes.value.find(
      note => note.path.toLocaleLowerCase('ru') === target,
    );
    if (caseInsensitive) {
      return linked(caseInsensitive);
    }

    const titleMatches = notes.value.filter(
      note => note.title.toLocaleLowerCase('ru') === target,
    );
    if (titleMatches.length === 1) {
      const match = titleMatches[0];
      if (match) {
        return linked(match);
      }
    }

    return {
      path: normalized,
      title: normalized.split('/').pop() ?? normalized,
      exists: false,
    };
  }

  return {
    notes,
    sortedNotes,
    notesByPath,
    allTags,
    status,
    error,
    isEmpty,
    getByPath,
    loadAll,
    create,
    save,
    setArchived,
    toggleTask,
    resolveDocumentLink,
  };
});
