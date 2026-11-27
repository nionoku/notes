/**
 * @fileoverview Построение внутренних URL приложения.
 */

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Маршрут документа по стабильному id заметки. */
export function noteRoute(id: string, anchor?: string): string {
  const url = `/note/${encodeURIComponent(id)}`;
  return anchor ? `${url}#${encodeURIComponent(anchor)}` : url;
}

/** Абсолютный URL документа по id. */
export function noteUrl(id: string, anchor?: string): string {
  return `${BASE_URL}${noteRoute(id, anchor)}`;
}

/** URL для markdown-ссылки на документ по id. */
export function noteMarkdownUrl(id: string, anchor?: string): string {
  return noteUrl(id, anchor);
}

export function editNoteRoute(id: string): string {
  return `${noteRoute(id)}/edit`;
}

export function createDocumentRoute(): string {
  return '/create';
}

export function createDocumentRouteWithTags(tags: readonly string[]): string {
  const params = new URLSearchParams();
  for (const tag of tags) {
    params.append('tags', tag);
  }
  const query = params.toString();
  return query ? `${createDocumentRoute()}?${query}` : createDocumentRoute();
}

export function notesListRoute(): string {
  return '/';
}

/** Маршрут импорта заметки из общей ссылки. */
export function sharedNoteRoute(encoded?: string): string {
  return encoded ? `/shared?note=${encoded}` : '/shared';
}

/** Абсолютный путь (с учётом base) для общей ссылки. */
export function sharedNoteUrl(encoded: string): string {
  return `${BASE_URL}${sharedNoteRoute(encoded)}`;
}

export function createDocumentUrl(): string {
  return `${BASE_URL}/create`;
}

export function createDocumentUrlWithTags(tags: readonly string[]): string {
  const params = new URLSearchParams();
  for (const tag of tags) {
    params.append('tags', tag);
  }
  const query = params.toString();
  return query ? `${createDocumentUrl()}?${query}` : createDocumentUrl();
}

export function notesListUrl(): string {
  return `${BASE_URL}/`;
}
