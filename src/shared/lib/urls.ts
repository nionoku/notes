/**
 * @fileoverview Построение внутренних URL приложения.
 */

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

function encodeSegments(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

/** URL для markdown-ссылки: кириллица остаётся читаемой, спецсимволы кодируются. */
export function documentMarkdownUrl(path: string, anchor?: string): string {
  const encodePart = (value: string): string =>
    value.replace(/[%# ?()<>[\]]/g, character => {
      const code = character.codePointAt(0) ?? 0;
      return `%${code.toString(16).toUpperCase().padStart(2, '0')}`;
    });
  const encodedPath = path.split('/').map(encodePart).join('/');
  const url = `${BASE_URL}/${encodedPath}`;
  return anchor ? `${url}#${encodePart(anchor)}` : url;
}

export function documentUrl(path: string, anchor?: string): string {
  const url = `${BASE_URL}/${encodeSegments(path)}`;
  return anchor ? `${url}#${encodeURIComponent(anchor)}` : url;
}

/** Путь для vue-router: base path добавляет сам router. */
export function documentRoute(path: string, anchor?: string): string {
  const url = `/${encodeSegments(path)}`;
  return anchor ? `${url}#${encodeURIComponent(anchor)}` : url;
}

export function editDocumentRoute(path: string): string {
  return `${documentRoute(path)}/edit`;
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

export function editDocumentUrl(path: string): string {
  return `${documentUrl(path)}/edit`;
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
