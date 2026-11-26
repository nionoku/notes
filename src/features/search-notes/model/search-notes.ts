/**
 * @fileoverview Поиск документов по названию, якорям и тегам.
 */

import type { Note } from '@/entities/note/model/note-types';
import { extractHeadings, type Heading } from '@/shared/lib/markdown-headings';

export type DocumentSearchMode = 'title' | 'anchor';

export interface AnchorSearchResult {
  readonly note: Note;
  readonly heading: Heading;
}

export interface DocumentSearchResult {
  readonly mode: DocumentSearchMode;
  readonly notes: readonly Note[];
  readonly anchors: readonly AnchorSearchResult[];
}

export function filterNotesByTags(
  notes: readonly Note[],
  selectedTags: readonly string[],
): Note[] {
  if (selectedTags.length === 0) {
    return [...notes];
  }
  return notes.filter(note =>
    selectedTags.every(tag => note.tags.includes(tag)),
  );
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('ru');
}

export function isAnchorQuery(query: string): boolean {
  return query.trimStart().startsWith('#');
}

export function searchDocuments(
  notes: readonly Note[],
  query: string,
  selectedTags: readonly string[],
): DocumentSearchResult {
  const tagFiltered = filterNotesByTags(notes, selectedTags);
  if (isAnchorQuery(query)) {
    const anchorQuery = normalize(query.trimStart().slice(1).trim());
    const anchors: AnchorSearchResult[] = [];
    for (const note of tagFiltered) {
      for (const heading of extractHeadings(note.body)) {
        if (
          !anchorQuery ||
          normalize(heading.text).includes(anchorQuery) ||
          normalize(heading.slug).includes(anchorQuery)
        ) {
          anchors.push({ note, heading });
        }
      }
    }
    return { mode: 'anchor', notes: [], anchors };
  }

  const titleQuery = normalize(query.trim());
  return {
    mode: 'title',
    notes: titleQuery
      ? tagFiltered.filter(note => normalize(note.title).includes(titleQuery))
      : tagFiltered,
    anchors: [],
  };
}
