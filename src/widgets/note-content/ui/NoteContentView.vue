<template>
  <div
    ref="rootRef"
    class="prose note-content"
    @click="handleClick"
    @change="handleChange"
    v-html="renderedHtml"
  ></div>
  <ImageLightbox
    v-model:open="lightboxOpen"
    :src="lightboxSrc"
    :alt="lightboxAlt"
  />
</template>

<script setup lang="ts">
/**
 * @fileoverview Отрисовка markdown-документа и интерактивных элементов.
 */

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import { noteRepository } from '@/entities/note/api/note-repository';
import { useNotesStore } from '@/entities/note/model/note-store';
import { findTaskLines } from '@/entities/note/model/note-tasks';
import type { Note } from '@/entities/note/model/note-types';
import { renderMarkdown } from '@/shared/lib/markdown';
import ImageLightbox from '@/shared/ui/ImageLightbox.vue';
import { slugifyHeading } from '@/shared/lib/markdown-headings';
import { documentRoute } from '@/shared/lib/urls';

const props = defineProps<{
  note: Note;
  anchor?: string;
}>();

const emit = defineEmits<{
  'toggle-task': [taskIndex: number, checked: boolean];
}>();

const rootRef = ref<HTMLElement | null>(null);
const notesStore = useNotesStore();
const router = useRouter();
const { t } = useI18n();
const objectUrls: string[] = [];
const lightboxOpen = ref(false);
const lightboxSrc = ref('');
const lightboxAlt = ref('');
let renderToken = 0;
let lastScrollKey = '';
let restoreFocusIndex: number | null = null;
let fitFrame = 0;

const TASK_BLOCK_TAGS: ReadonlySet<string> = new Set([
  'BLOCKQUOTE',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'OL',
  'P',
  'PRE',
  'TABLE',
  'UL',
]);

function wrapTaskInput(input: HTMLInputElement): HTMLLabelElement | null {
  const parent = input.parentElement;
  if (!parent) {
    return null;
  }

  const existing = input.closest<HTMLLabelElement>('label.task-label');
  if (existing) {
    return existing;
  }

  const label = document.createElement('label');
  label.className = 'task-label';
  input.replaceWith(label);
  label.append(input);

  let node = label.nextSibling;
  while (node) {
    const next = node.nextSibling;
    if (
      node instanceof Element &&
      (TASK_BLOCK_TAGS.has(node.tagName) || node.tagName === 'INPUT')
    ) {
      break;
    }
    label.append(node);
    node = next;
  }

  const listItem = parent.closest('li');
  if (listItem) {
    listItem.classList.add('task-item');
  }

  return label;
}

function fitAllFigures(): void {
  const root = rootRef.value;
  if (!root) {
    return;
  }
  for (const image of root.querySelectorAll<HTMLImageElement>(
    '.image-preview img',
  )) {
    const figure = image.closest<HTMLElement>('.image-figure');
    if (!figure) {
      continue;
    }
    figure.style.inlineSize = '';
    const width = image.getBoundingClientRect().width;
    if (width > 0) {
      figure.style.inlineSize = `${width}px`;
    }
  }
}

function scheduleFigureFit(): void {
  window.cancelAnimationFrame(fitFrame);
  fitFrame = window.requestAnimationFrame(() => {
    fitFrame = 0;
    fitAllFigures();
  });
}

const renderedHtml = computed(() =>
  renderMarkdown(props.note.body, {
    fromPath: props.note.path,
    resolveDocumentLink: (rawPath, documentAnchor) =>
      notesStore.resolveDocumentLink(rawPath, props.note.path, documentAnchor),
  }),
);

function headingId(
  heading: HTMLHeadingElement,
  used: Map<string, number>,
): string {
  const base = heading.id || slugifyHeading(heading.textContent ?? '');
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

async function enhanceContent(): Promise<void> {
  const root = rootRef.value;
  if (!root) {
    return;
  }

  renderToken += 1;
  const token = renderToken;

  for (const url of objectUrls) {
    URL.revokeObjectURL(url);
  }
  objectUrls.length = 0;

  const usedIds = new Map<string, number>();
  for (const heading of root.querySelectorAll<HTMLHeadingElement>(
    'h1, h2, h3, h4, h5, h6',
  )) {
    heading.id = headingId(heading, usedIds);
  }

  const taskCount = findTaskLines(props.note.body).length;
  root
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    .forEach((input, index) => {
      if (index >= taskCount) {
        return;
      }
      input.disabled = false;
      input.dataset['taskIndex'] = String(index);
      const label = wrapTaskInput(input);
      if (!label || !label.textContent?.trim()) {
        input.setAttribute(
          'aria-label',
          t('task.checkbox', { number: index + 1 }),
        );
      }
    });

  if (restoreFocusIndex !== null) {
    const input = root.querySelector<HTMLInputElement>(
      `input[data-task-index="${restoreFocusIndex}"]`,
    );
    input?.focus({ preventScroll: true });
    restoreFocusIndex = null;
  }

  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    if (
      /^https?:\/\//i.test(href) &&
      !href.startsWith(window.location.origin)
    ) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
  }

  for (const image of root.querySelectorAll<HTMLImageElement>('img')) {
    if (image.closest('a') || image.closest('.image-figure')) {
      continue;
    }
    const captionText = image.alt.trim() || image.title.trim();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'image-preview';
    button.setAttribute(
      'aria-label',
      captionText
        ? t('imageLightbox.openWithCaption', { caption: captionText })
        : t('imageLightbox.open'),
    );
    button.title = t('imageLightbox.open');

    const figure = document.createElement('figure');
    figure.className = 'image-figure';
    image.replaceWith(figure);
    figure.append(button);
    button.append(image);
    image.addEventListener('load', scheduleFigureFit);

    if (captionText) {
      const caption = document.createElement('figcaption');
      caption.className = 'image-caption';
      caption.textContent = captionText;
      figure.append(caption);
    }
  }

  const imageLoads: Promise<void>[] = [];
  for (const image of root.querySelectorAll<HTMLImageElement>('img[src]')) {
    image.decoding = 'async';
    const source = image.getAttribute('src') ?? '';
    if (!source || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source)) {
      image.loading = 'lazy';
      image.dataset['fullSrc'] = source;
      continue;
    }

    image.loading = 'eager';
    imageLoads.push(
      noteRepository
        .resolveAssetUrl(props.note.dirPath, source)
        .then(async url => {
          if (!url) {
            image.classList.add('image-missing');
            return;
          }
          if (token !== renderToken || !image.isConnected) {
            URL.revokeObjectURL(url);
            return;
          }
          objectUrls.push(url);
          image.src = url;
          image.dataset['fullSrc'] = url;
          await image.decode().catch(() => undefined);
          scheduleFigureFit();
        })
        .catch(() => {
          image.classList.add('image-missing');
        }),
    );
  }

  await Promise.race([
    Promise.allSettled(imageLoads),
    new Promise(resolve => window.setTimeout(resolve, 2_000)),
  ]);
  fitAllFigures();
}

function scrollToAnchor(hash: string): void {
  const root = rootRef.value;
  if (!root || !hash) {
    return;
  }

  let decoded = hash.replace(/^#/, '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Оставляем исходную строку.
  }
  if (!decoded) {
    return;
  }

  const elements = [...root.querySelectorAll<HTMLElement>('[id]')];
  const headings = [
    ...root.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6'),
  ];
  const slug = slugifyHeading(decoded);
  const target =
    elements.find(element => element.id === decoded) ??
    elements.find(element => element.id === slug) ??
    headings.find(
      heading =>
        (heading.textContent ?? '').trim().toLocaleLowerCase('ru') ===
        decoded.toLocaleLowerCase('ru'),
    );

  target?.scrollIntoView({ block: 'start', behavior: 'auto' });
}

function openLightbox(src: string, alt: string): void {
  if (!src) {
    return;
  }
  lightboxSrc.value = src;
  lightboxAlt.value = alt;
  lightboxOpen.value = true;
}

function handleClick(event: MouseEvent): void {
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey
  ) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const preview = target.closest('button.image-preview');
  if (preview) {
    const image = preview.querySelector('img');
    if (image) {
      event.preventDefault();
      openLightbox(
        image.dataset['fullSrc'] ?? image.currentSrc ?? image.src,
        image.alt,
      );
      return;
    }
  }

  const documentLink = target.closest<HTMLAnchorElement>(
    'a[data-document-path]',
  );
  if (documentLink) {
    const path = documentLink.dataset['documentPath'];
    if (!path) {
      return;
    }
    event.preventDefault();
    const documentAnchor = documentLink.dataset['documentAnchor'];
    void router.push(documentRoute(path, documentAnchor));
    return;
  }

  const internalLink = target.closest<HTMLAnchorElement>('a[href]');
  if (!internalLink) {
    return;
  }
  const href = internalLink.getAttribute('href');
  if (!href || !href.startsWith('/') || href.startsWith('//')) {
    return;
  }
  event.preventDefault();
  void router.push(href);
}

function handleChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
    return;
  }
  const index = Number(target.dataset['taskIndex']);
  if (!Number.isInteger(index)) {
    return;
  }
  restoreFocusIndex = index;
  emit('toggle-task', index, target.checked);
}

watch(
  [renderedHtml, () => props.anchor, () => props.note.path],
  async ([html, anchor], previous) => {
    await nextTick();
    const previousHtml = previous?.[0];
    if (html !== previousHtml) {
      await enhanceContent();
    }

    const scrollKey = `${props.note.path}#${anchor ?? ''}`;
    if (anchor && scrollKey !== lastScrollKey) {
      lastScrollKey = scrollKey;
      await nextTick();
      scrollToAnchor(anchor);
    }
  },
  { immediate: true, flush: 'post' },
);

onMounted(() => {
  window.addEventListener('resize', scheduleFigureFit);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleFigureFit);
  window.cancelAnimationFrame(fitFrame);
  for (const url of objectUrls) {
    URL.revokeObjectURL(url);
  }
  objectUrls.length = 0;
});
</script>

<style scoped>
.note-content {
  margin-block-start: 1.5rem;
}

.note-content :deep(.image-missing) {
  min-block-size: 2rem;
  border: 1px dashed var(--color-border);
}
</style>
