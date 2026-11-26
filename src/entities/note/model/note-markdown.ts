/**
 * @fileoverview Чтение и запись markdown-документов с YAML frontmatter.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import {
  documentTitle,
  stripDocumentExtension,
} from '@/entities/note/model/note-path';

export interface ParsedMarkdownDocument {
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly body: string;
  readonly title: string;
}

const FRONTMATTER_PATTERN =
  /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return { ...value };
}

/** Удаляет первый H1, если он дословно совпадает с заголовком документа. */
function stripDuplicateTitle(body: string, title: string): string {
  const normalizedTitle = title.trim();
  const match = /^\uFEFF?\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(body);
  if (!match) {
    return body;
  }

  const heading = (match[1] ?? '').trim();
  if (heading !== normalizedTitle) {
    return body;
  }

  return body.slice(match[0].length).replace(/^\s*\r?\n/, '');
}

export function parseMarkdownDocument(
  raw: string,
  fallbackTitle: string,
): ParsedMarkdownDocument {
  const fallback = stripDocumentExtension(documentTitle(fallbackTitle));
  let frontmatter: Record<string, unknown> = {};
  let body = raw;

  const match = FRONTMATTER_PATTERN.exec(raw);
  if (match) {
    try {
      const record = asRecord(parseYaml(match[1] ?? ''));
      if (record) {
        frontmatter = record;
        body = raw.slice(match[0].length);
      }
    } catch {
      // Повреждённый frontmatter не должен ломать загрузку всей базы.
      frontmatter = {};
      body = raw;
    }
  }

  const storedTitle =
    typeof frontmatter['title'] === 'string' ? frontmatter['title'].trim() : '';
  const title = storedTitle || fallback;

  return {
    frontmatter,
    title,
    body: stripDuplicateTitle(body, title).replace(/\r\n/g, '\n'),
  };
}

export function normalizeTags(value: unknown): string[] {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : [];
  const tags: string[] = [];

  for (const tag of rawTags) {
    if (typeof tag !== 'string') {
      continue;
    }
    const normalized = tag.trim().replace(/^#+/, '').trim();
    if (!normalized) {
      continue;
    }
    if (!tags.includes(normalized)) {
      tags.push(normalized);
    }
  }

  return tags;
}

export function serializeMarkdownDocument(
  title: string,
  frontmatter: Readonly<Record<string, unknown>>,
  body: string,
): string {
  const documentTitle = title.trim() || 'Untitled';
  const data: Record<string, unknown> = { ...frontmatter };
  if (Array.isArray(data['tags']) && data['tags'].length === 0) {
    delete data['tags'];
  }

  const hasFrontmatter = Object.keys(data).length > 0;
  const yaml = hasFrontmatter
    ? stringifyYaml(data, { lineWidth: 0 }).trimEnd()
    : '';
  const titleHeading = `# ${documentTitle}`;
  const content = body.replace(/^\s*\r?\n/, '').replace(/\s+$/, '');

  return [hasFrontmatter ? `---\n${yaml}\n---` : '', titleHeading, content]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n');
}
