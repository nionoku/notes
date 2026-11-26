/**
 * @fileoverview Формирование якорей заголовков.
 */

/** Убирает markdown-разметку из строки, оставляя читаемый текст. */
export function inlinePlainText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Преобразует заголовок в якорь, сохраняя кириллицу. */
export function slugifyHeading(value: string): string {
  const slug = inlinePlainText(value)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'section';
}

export interface Heading {
  readonly depth: number;
  readonly text: string;
  readonly slug: string;
}

interface HeadingCounter {
  readonly counts: Map<string, number>;
}

function uniqueSlug(state: HeadingCounter, slug: string): string {
  const count = state.counts.get(slug) ?? 0;
  state.counts.set(slug, count + 1);
  return count === 0 ? slug : `${slug}-${count}`;
}

/**
 * Извлекает заголовки из markdown, пропуская блоки кода.
 */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const counter: HeadingCounter = { counts: new Map() };
  let fence: string | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? '';
      if (fence === null) {
        fence = marker[0] ?? null;
      } else if (marker[0] === fence) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) {
      continue;
    }

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) {
      continue;
    }

    const text = inlinePlainText(match[2] ?? '');
    if (!text) {
      continue;
    }

    headings.push({
      depth: (match[1] ?? '#').length,
      text,
      slug: uniqueSlug(counter, slugifyHeading(text)),
    });
  }

  return headings;
}
