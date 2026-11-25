/**
 * @fileoverview Формирование обычных markdown-ссылок на документы.
 */

import type {ResolvedDocumentLink} from '@/shared/lib/markdown';
import {documentMarkdownUrl} from '@/shared/lib/urls';

export interface DocumentLinkLabel {
  readonly path: string;
  readonly anchor: string;
  readonly title: string;
  readonly anchorTitle: string;
}

export type ResolveLegacyDocumentLink = (
  rawPath: string,
  anchor?: string,
) => ResolvedDocumentLink | null;

export function humanizeDocumentAnchor(anchor: string): string {
  let value = anchor;
  try {
    value = decodeURIComponent(anchor);
  } catch {
    // Оставляем исходное значение, если оно не URL-кодировано.
  }
  return value.replace(/^#/, '').replace(/-+/g, ' ').trim() || anchor;
}

function escapeLinkText(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/([[\]\\])/g, '\\$1');
}

export function buildDocumentLinkMarkdown(link: DocumentLinkLabel): string {
  const label = link.anchor
    ? `${link.anchorTitle || humanizeDocumentAnchor(link.anchor)} (${link.title})`
    : link.title;
  const url = documentMarkdownUrl(link.path, link.anchor || undefined);
  return `[${escapeLinkText(label)}](${url})`;
}

function replaceLinks(
  text: string,
  resolve: ResolveLegacyDocumentLink,
): string {
  return text.replace(
    /@\{([^}\n]+)\}(?:\[#([^\]\n]+)\])?/g,
    (raw, rawPath: string, rawAnchor?: string) => {
      const anchor = rawAnchor?.trim() ?? '';
      const resolved = resolve(rawPath.trim(), anchor || undefined);
      if (!resolved) {
        return raw;
      }
      return buildDocumentLinkMarkdown({
        path: resolved.path,
        anchor,
        title: resolved.title,
        anchorTitle: resolved.anchorTitle ?? '',
      });
    },
  );
}

function replaceLinksOutsideInlineCode(
  line: string,
  resolve: ResolveLegacyDocumentLink,
): string {
  return line
    .split(/(`+[^`]*?`+)/g)
    .map((part, index) =>
      index % 2 === 1 ? part : replaceLinks(part, resolve),
    )
    .join('');
}

/**
 * Превращает устаревший синтаксис `@{путь}[#якорь]` в обычные markdown-ссылки.
 * Блоки и inline-код не затрагиваются.
 */
export function replaceLegacyDocumentLinks(
  markdown: string,
  resolve: ResolveLegacyDocumentLink,
): string {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map(line => {
      const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch[1]?.[0] ?? null;
        if (fence === null) {
          fence = marker;
        } else if (marker === fence) {
          fence = null;
        }
        return line;
      }
      if (fence !== null) {
        return line;
      }
      return replaceLinksOutsideInlineCode(line, resolve);
    })
    .join('\n');
}
