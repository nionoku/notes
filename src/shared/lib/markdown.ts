/**
 * @fileoverview Преобразование markdown в безопасный HTML.
 */

import DOMPurify from 'dompurify';
import { Marked, type MarkedExtension, type Tokens } from 'marked';

import { escapeHtml } from '@/shared/lib/html';
import { noteUrl } from '@/shared/lib/urls';

export interface ResolvedDocumentLink {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly exists: boolean;
  readonly anchorTitle?: string;
}

export interface MarkdownRenderContext {
  readonly fromPath: string;
  readonly resolveDocumentLink: (
    rawPath: string,
    anchor?: string,
  ) => ResolvedDocumentLink | null;
}

function humanizeAnchor(anchor: string): string {
  let value = anchor;
  try {
    value = decodeURIComponent(anchor);
  } catch {
    // Оставляем исходное значение, если оно не URL-кодировано.
  }
  return value.replace(/^#/, '').replace(/-+/g, ' ').trim() || anchor;
}

interface DocumentLinkToken extends Tokens.Generic {
  readonly type: 'documentLink';
  readonly docPath: string;
  readonly anchor?: string;
}

function documentLinkExtension(
  context: MarkdownRenderContext,
): MarkedExtension {
  return {
    extensions: [
      {
        name: 'documentLink',
        level: 'inline',
        start(src: string) {
          const index = src.indexOf('@{');
          return index >= 0 ? index : undefined;
        },
        tokenizer(src: string) {
          const match = /^@\{([^}\n]+)\}(?:\[#([^\]\n]+)\])?/.exec(src);
          if (!match) {
            return undefined;
          }
          return {
            type: 'documentLink',
            raw: match[0],
            docPath: (match[1] ?? '').trim(),
            anchor: match[2]?.trim(),
          } satisfies DocumentLinkToken;
        },
        renderer(token) {
          const link = token as DocumentLinkToken;
          const resolved = context.resolveDocumentLink(
            link.docPath,
            link.anchor,
          );
          const fallbackTitle = link.docPath.split('/').pop() ?? link.docPath;
          const title = resolved?.title ?? fallbackTitle;
          const id = resolved?.id ?? '';
          const exists = resolved?.exists ?? false;
          const classNames = ['document-link'];
          if (!exists) {
            classNames.push('document-link--missing');
          }
          const label = link.anchor
            ? `${resolved?.anchorTitle ?? humanizeAnchor(link.anchor)} (${title})`
            : title;
          const attributes = [
            `class="${classNames.join(' ')}"`,
            `title="${escapeHtml(link.docPath)}"`,
          ];
          if (id) {
            attributes.unshift(
              `href="${escapeHtml(noteUrl(id, link.anchor))}"`,
              `data-document-id="${escapeHtml(id)}"`,
            );
          } else {
            attributes.push('aria-disabled="true"');
          }
          if (link.anchor) {
            attributes.push(
              `data-document-anchor="${escapeHtml(link.anchor)}"`,
            );
          }
          return `<a ${attributes.join(' ')}>${escapeHtml(label)}</a>`;
        },
      },
    ],
  };
}

const SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true },
  ADD_TAGS: ['u', 's', 'del', 'input'],
  ADD_ATTR: [
    'target',
    'rel',
    'data-document-id',
    'data-document-anchor',
    'checked',
    'disabled',
    'type',
  ],
  FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['style'],
  ALLOW_DATA_ATTR: true,
};

export function renderMarkdown(
  markdown: string,
  context: MarkdownRenderContext,
): string {
  const marked = new Marked(
    { gfm: true, breaks: false },
    documentLinkExtension(context),
  );
  const html = marked.parse(markdown, { async: false });
  return DOMPurify.sanitize(html, SANITIZE_OPTIONS);
}
