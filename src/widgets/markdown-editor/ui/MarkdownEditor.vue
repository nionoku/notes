<template>
  <div class="markdown-editor">
    <label
      class="markdown-editor__label"
      :for="inputId"
      >{{ displayLabel }}</label
    >
    <MarkdownToolbar
      :active="activeFormats"
      :allow-images="canUploadImages"
      :table="tableContext"
      @action="handleAction"
    />
    <textarea
      :id="inputId"
      ref="textareaRef"
      class="markdown-editor__input"
      :value="modelValue"
      name="content"
      rows="18"
      spellcheck="true"
      :aria-describedby="hintId"
      @input="handleInput"
      @keydown="handleKeydown"
      @select="syncSelection"
      @keyup="syncSelection"
      @click="syncSelection"
      @focus="syncSelection"
    ></textarea>
    <p
      :id="hintId"
      class="hint"
    >
      {{ t('markdownEditor.hint') }}
    </p>
    <template v-if="isUploading">
      <p
        class="form-status"
        role="status"
      >
        {{ t('markdownEditor.uploading') }}
      </p>
    </template>
    <template v-if="uploadError">
      <p
        class="form-error"
        role="alert"
      >
        {{ uploadError }}
      </p>
    </template>

    <LinkDialog
      v-model:open="linkOpen"
      :initial-text="linkInitialText"
      @submit="handleLinkSubmit"
    />
    <ImageDialog
      v-model:open="imageOpen"
      @submit="handleImageSubmit"
    />
    <DocumentLinkDialog
      v-model:open="documentLinkOpen"
      :initial-path="documentPath"
      @submit="handleDocumentLinkSubmit"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Редактор markdown: textarea, панель инструментов и диалоги
 * вставки.
 */

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from 'vue';
import { useI18n } from 'vue-i18n';

import ImageDialog from '@/features/insert-image/ui/ImageDialog.vue';
import DocumentLinkDialog from '@/features/insert-document-link/ui/DocumentLinkDialog.vue';
import LinkDialog from '@/features/insert-link/ui/LinkDialog.vue';
import type { ToolbarAction } from '@/widgets/markdown-editor/model/toolbar-actions';
import {
  addTableColumnRight,
  addTableRowBelow,
  beautifyTable,
  continueMarkdown,
  type BlockFormat,
  type EditorSelection,
  type EditResult,
  type InlineFormat,
  type TableOperation,
  deleteTableColumn,
  deleteTableRow,
  indentListSelection,
  insertHorizontalRule,
  insertTable,
  isFormatActive,
  outdentListSelection,
  tableContextAt,
  toggleBlockFormat,
  toggleInlineFormat,
} from '@/widgets/markdown-editor/model/editor-formatting';
import MarkdownToolbar from '@/widgets/markdown-editor/ui/MarkdownToolbar.vue';
import { buildDocumentLinkMarkdown } from '@/shared/lib/document-links';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label?: string;
    id?: string;
    documentPath?: string;
    allowImages?: boolean;
    uploadImage?: (file: File, alt: string) => Promise<string>;
  }>(),
  {
    documentPath: '',
    allowImages: false,
  },
);

const { t } = useI18n();
const displayLabel = computed(() => props.label || t('markdownEditor.label'));

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const INLINE_FORMATS: ReadonlySet<string> = new Set<InlineFormat>([
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
]);

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const selection = ref<EditorSelection>({ start: 0, end: 0 });
const EDITOR_EXTRA_LINES = 2;
let fitFrame = 0;
let measureMirror: HTMLTextAreaElement | null = null;
let caretMirror: HTMLDivElement | null = null;
const generatedId = useId();
const inputId = computed(() => props.id ?? `markdown-editor-${generatedId}`);
const hintId = computed(() => `${inputId.value}-hint`);

const linkOpen = ref(false);
const imageOpen = ref(false);
const documentLinkOpen = ref(false);
const linkInitialText = ref('');
const pendingSelection = ref<EditorSelection>({ start: 0, end: 0 });
const uploadError = ref<string | null>(null);
const isUploading = ref(false);

const canUploadImages = computed(
  () => props.allowImages && typeof props.uploadImage === 'function',
);

const activeFormats = computed(() => {
  const active = new Set<string>();
  for (const format of INLINE_FORMATS) {
    if (
      isFormatActive(props.modelValue, selection.value, format as InlineFormat)
    ) {
      active.add(format);
    }
  }
  const blockFormats: readonly BlockFormat[] = [
    'heading-2',
    'heading-3',
    'quote',
    'unordered-list',
    'ordered-list',
    'checkbox-list',
    'code-block',
  ];
  for (const format of blockFormats) {
    if (isFormatActive(props.modelValue, selection.value, format)) {
      active.add(format);
    }
  }
  return active;
});

const tableContext = computed(() =>
  tableContextAt(props.modelValue, selection.value.start),
);

function textareaLineHeight(textarea: HTMLTextAreaElement): number {
  const style = window.getComputedStyle(textarea);
  const parsed = Number.parseFloat(style.lineHeight);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  const fontSize = Number.parseFloat(style.fontSize);
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.6 : 24;
}

function getMeasureMirror(textarea: HTMLTextAreaElement): HTMLTextAreaElement {
  if (measureMirror) {
    return measureMirror;
  }

  const mirror = textarea.cloneNode() as HTMLTextAreaElement;
  mirror.removeAttribute('id');
  mirror.removeAttribute('name');
  mirror.removeAttribute('aria-describedby');
  mirror.removeAttribute('autofocus');
  mirror.tabIndex = -1;
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'fixed';
  mirror.style.inset = '0 auto auto 0';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.height = '0px';
  mirror.style.minHeight = '0px';
  mirror.style.setProperty('min-block-size', '0px');
  mirror.style.overflow = 'hidden';
  mirror.style.resize = 'none';
  document.body.append(mirror);
  measureMirror = mirror;
  return mirror;
}

function fitTextareaHeight(): void {
  const textarea = textareaRef.value;
  if (!textarea) {
    return;
  }

  const style = window.getComputedStyle(textarea);
  const borderInline =
    (Number.parseFloat(style.borderLeftWidth) || 0) +
    (Number.parseFloat(style.borderRightWidth) || 0);
  const borderBlock =
    (Number.parseFloat(style.borderTopWidth) || 0) +
    (Number.parseFloat(style.borderBottomWidth) || 0);
  const lineHeight = textareaLineHeight(textarea);

  const mirror = getMeasureMirror(textarea);
  mirror.style.width = `${textarea.clientWidth + borderInline}px`;
  mirror.value = textarea.value;
  const contentHeight = mirror.scrollHeight;

  textarea.style.height = `${
    contentHeight + lineHeight * EDITOR_EXTRA_LINES + borderBlock
  }px`;
}

function getCaretMirror(textarea: HTMLTextAreaElement): HTMLDivElement {
  if (caretMirror) {
    return caretMirror;
  }

  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const properties = [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'font-variant',
    'font-kerning',
    'font-feature-settings',
    'font-variant-ligatures',
    'letter-spacing',
    'line-height',
    'word-spacing',
    'text-transform',
    'text-indent',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'tab-size',
    'direction',
    'text-align',
    'word-break',
    'white-space',
  ];
  for (const property of properties) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  mirror.style.setProperty('position', 'fixed');
  mirror.style.setProperty('inset', '0 auto auto 0');
  mirror.style.setProperty('box-sizing', 'border-box');
  mirror.style.setProperty('visibility', 'hidden');
  mirror.style.setProperty('pointer-events', 'none');
  mirror.style.setProperty('overflow', 'hidden');
  mirror.style.setProperty('overflow-wrap', 'break-word');
  mirror.setAttribute('aria-hidden', 'true');
  document.body.append(mirror);
  caretMirror = mirror;
  return mirror;
}

function centerTextareaCaret(): void {
  const textarea = textareaRef.value;
  if (!textarea || document.activeElement !== textarea) {
    return;
  }

  const style = window.getComputedStyle(textarea);
  const mirror = getCaretMirror(textarea);
  mirror.style.width = `${textarea.clientWidth}px`;

  const lineHeight = textareaLineHeight(textarea);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  marker.style.setProperty('display', 'inline-block');
  marker.style.setProperty('inline-size', '0');
  marker.style.setProperty('block-size', `${lineHeight}px`);
  marker.style.setProperty('vertical-align', 'top');
  marker.style.setProperty('overflow', 'hidden');
  const before = textarea.value.slice(0, textarea.selectionEnd);
  mirror.replaceChildren(document.createTextNode(before), marker);

  const markerRect = marker.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  const caretTop =
    textareaRect.top + borderTop + markerRect.top - textarea.scrollTop;
  const viewport = window.visualViewport;
  const viewportCenter = viewport
    ? viewport.offsetTop + viewport.height / 2
    : window.innerHeight / 2;
  const target = window.scrollY + caretTop - viewportCenter;

  if (Math.abs(target - window.scrollY) < 1) {
    return;
  }
  window.scrollTo({
    top: Math.max(0, target),
    left: window.scrollX,
    behavior: 'smooth',
  });
}

function scheduleTextareaFit(): void {
  window.cancelAnimationFrame(fitFrame);
  fitFrame = window.requestAnimationFrame(() => {
    fitFrame = 0;
    fitTextareaHeight();
    centerTextareaCaret();
  });
}

function syncSelection(): void {
  const textarea = textareaRef.value;
  if (!textarea) {
    return;
  }
  selection.value = {
    start: textarea.selectionStart,
    end: textarea.selectionEnd,
  };
}

function currentSelection(): EditorSelection {
  const textarea = textareaRef.value;
  if (textarea && document.activeElement === textarea) {
    return {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }
  return selection.value;
}

function applyEdit(result: EditResult): void {
  const textarea = textareaRef.value;
  if (!textarea) {
    return;
  }

  const oldValue = textarea.value;
  const newValue = result.value;
  if (oldValue === newValue) {
    textarea.setSelectionRange(result.selection.start, result.selection.end);
    syncSelection();
    return;
  }

  let prefix = 0;
  while (
    prefix < oldValue.length &&
    prefix < newValue.length &&
    oldValue[prefix] === newValue[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < oldValue.length - prefix &&
    suffix < newValue.length - prefix &&
    oldValue[oldValue.length - 1 - suffix] ===
      newValue[newValue.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const replaceStart = prefix;
  const replaceEnd = oldValue.length - suffix;
  const replacement = newValue.slice(prefix, newValue.length - suffix);

  textarea.focus();
  textarea.setSelectionRange(replaceStart, replaceEnd);
  let inserted: boolean;
  try {
    inserted = document.execCommand('insertText', false, replacement);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    textarea.value = newValue;
    emit('update:modelValue', newValue);
  } else if (textarea.value === newValue) {
    emit('update:modelValue', newValue);
  }

  textarea.setSelectionRange(result.selection.start, result.selection.end);
  syncSelection();
  scheduleTextareaFit();
}

function handleInput(): void {
  const textarea = textareaRef.value;
  if (!textarea) {
    return;
  }
  emit('update:modelValue', textarea.value);
  syncSelection();
  scheduleTextareaFit();
}

function editorValue(): string {
  return textareaRef.value?.value ?? props.modelValue;
}

function insertText(text: string, at?: EditorSelection): void {
  const target = at ?? currentSelection();
  const value = editorValue();
  const next = `${value.slice(0, target.start)}${text}${value.slice(target.end)}`;
  applyEdit({
    value: next,
    selection: {
      start: target.start + text.length,
      end: target.start + text.length,
    },
  });
}

function insertBlockText(text: string, at?: EditorSelection): void {
  const target = at ?? currentSelection();
  const value = editorValue();
  const before = value.slice(0, target.start);
  const after = value.slice(target.end);
  const leading =
    before === ''
      ? ''
      : before.endsWith('\n\n')
        ? ''
        : before.endsWith('\n')
          ? '\n'
          : '\n\n';
  const trailing =
    after === ''
      ? '\n'
      : after.startsWith('\n\n')
        ? ''
        : after.startsWith('\n')
          ? '\n'
          : '\n\n';
  insertText(`${leading}${text}${trailing}`, target);
}

function applyInline(format: InlineFormat): void {
  applyEdit(toggleInlineFormat(editorValue(), currentSelection(), format));
}

function applyBlock(format: BlockFormat): void {
  applyEdit(toggleBlockFormat(editorValue(), currentSelection(), format));
}

function openLinkDialog(): void {
  const current = currentSelection();
  pendingSelection.value = current;
  linkInitialText.value = editorValue().slice(current.start, current.end);
  linkOpen.value = true;
}

function openImageDialog(): void {
  if (!canUploadImages.value) {
    return;
  }
  pendingSelection.value = currentSelection();
  uploadError.value = null;
  imageOpen.value = true;
}

function openDocumentLinkDialog(): void {
  pendingSelection.value = currentSelection();
  documentLinkOpen.value = true;
}

function applyTableOperation(operation: TableOperation): void {
  const result = operation(editorValue(), currentSelection().start);
  if (result) {
    applyEdit(result);
  }
}

function handleAction(action: ToolbarAction): void {
  switch (action) {
    case 'link':
      openLinkDialog();
      return;
    case 'image':
      openImageDialog();
      return;
    case 'document-link':
      openDocumentLinkDialog();
      return;
    case 'horizontal-rule':
      applyEdit(insertHorizontalRule(editorValue(), currentSelection().start));
      return;
    case 'table':
      applyEdit(insertTable(editorValue(), currentSelection().start));
      return;
    case 'table-add-row':
      applyTableOperation(addTableRowBelow);
      return;
    case 'table-add-column':
      applyTableOperation(addTableColumnRight);
      return;
    case 'table-delete-row':
      applyTableOperation(deleteTableRow);
      return;
    case 'table-delete-column':
      applyTableOperation(deleteTableColumn);
      return;
    case 'table-beautify':
      applyTableOperation(beautifyTable);
      return;
    default:
      break;
  }

  if (INLINE_FORMATS.has(action)) {
    applyInline(action as InlineFormat);
  } else {
    applyBlock(action as BlockFormat);
  }
}

function normalizeUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|#|\.{0,2}\/)/i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

function markdownDestination(url: string): string {
  return /[\s()<>]/.test(url) ? `<${url.replace(/>/g, '%3E')}>` : url;
}

function handleLinkSubmit(payload: {
  readonly url: string;
  readonly text: string;
}): void {
  const url = normalizeUrl(payload.url);
  const text = (payload.text || url).replace(/([[\]])/g, '\\$1');
  insertText(`[${text}](${markdownDestination(url)})`, pendingSelection.value);
}

function fileBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

async function handleImageSubmit(payload: {
  readonly file: File;
  readonly alt: string;
}): Promise<void> {
  const upload = props.uploadImage;
  if (!upload) {
    return;
  }

  isUploading.value = true;
  uploadError.value = null;
  try {
    const alt = (payload.alt || fileBaseName(payload.file.name)).replace(
      /([[\]])/g,
      '',
    );
    const source = await upload(payload.file, alt);
    insertBlockText(
      `![${alt}](${markdownDestination(source)})`,
      pendingSelection.value,
    );
  } catch (error) {
    uploadError.value =
      error instanceof Error ? error.message : t('imageDialog.uploadError');
  } finally {
    isUploading.value = false;
  }
}

function handleDocumentLinkSubmit(payload: {
  readonly id: string;
  readonly path: string;
  readonly anchor: string;
  readonly title: string;
  readonly anchorTitle: string;
}): void {
  const syntax = buildDocumentLinkMarkdown({
    id: payload.id,
    path: payload.path,
    anchor: payload.anchor,
    title: payload.title,
    anchorTitle: payload.anchorTitle,
  });
  insertText(syntax, pendingSelection.value);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229) {
    return;
  }

  const modifier = event.metaKey || event.ctrlKey;
  const textarea = textareaRef.value;
  if (!textarea) {
    return;
  }

  if (modifier && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      applyInline('bold');
      return;
    }
    if (key === 'i') {
      event.preventDefault();
      applyInline('italic');
      return;
    }
    if (key === 'u') {
      event.preventDefault();
      applyInline('underline');
      return;
    }
    if (key === 'k') {
      event.preventDefault();
      openLinkDialog();
      return;
    }
  }

  if (modifier && event.altKey) {
    if (event.code === 'KeyT') {
      event.preventDefault();
      applyEdit(insertTable(textarea.value, textarea.selectionStart));
      return;
    }
    if (event.code === 'KeyR' || event.code === 'KeyC') {
      const operation: TableOperation = event.shiftKey
        ? event.code === 'KeyR'
          ? deleteTableRow
          : deleteTableColumn
        : event.code === 'KeyR'
          ? addTableRowBelow
          : addTableColumnRight;
      const result = operation(textarea.value, textarea.selectionStart);
      if (result) {
        event.preventDefault();
        applyEdit(result);
      }
      return;
    }
    if (event.code === 'Digit2' || event.code === 'Numpad2') {
      event.preventDefault();
      applyBlock('heading-2');
      return;
    }
    if (event.code === 'Digit3' || event.code === 'Numpad3') {
      event.preventDefault();
      applyBlock('heading-3');
      return;
    }
  }

  if (event.key === 'Tab' && !event.altKey && !modifier) {
    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
    const result = event.shiftKey
      ? outdentListSelection(textarea.value, selection)
      : indentListSelection(textarea.value, selection);
    if (result) {
      event.preventDefault();
      applyEdit(result);
    }
    return;
  }

  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    modifier ||
    event.altKey ||
    textarea.selectionStart !== textarea.selectionEnd
  ) {
    return;
  }

  const result = continueMarkdown(textarea.value, textarea.selectionStart);
  if (!result) {
    return;
  }
  event.preventDefault();
  applyEdit(result);
}

watch(
  () => props.modelValue,
  () => {
    void nextTick(scheduleTextareaFit);
  },
);

onMounted(() => {
  window.addEventListener('resize', scheduleTextareaFit);
  window.visualViewport?.addEventListener('resize', scheduleTextareaFit);
  scheduleTextareaFit();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleTextareaFit);
  window.visualViewport?.removeEventListener('resize', scheduleTextareaFit);
  window.cancelAnimationFrame(fitFrame);
  measureMirror?.remove();
  measureMirror = null;
  caretMirror?.remove();
  caretMirror = null;
});
</script>

<style scoped>
.markdown-editor {
  display: flex;
  flex-direction: column;
}

/* Запас снизу, чтобы последнюю строку тоже можно было держать по центру. */
.markdown-editor:focus-within {
  padding-block-end: 40vh;
}

.markdown-editor__label {
  margin-block-end: 0.35rem;
  font-weight: 600;
}

.markdown-editor__input {
  inline-size: 100%;
  min-block-size: 18rem;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-block-start: 0;
  border-end-start-radius: 0.375rem;
  border-end-end-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.9375rem;
  line-height: 1.6;
  resize: vertical;
}

.markdown-editor .hint {
  margin-block-start: 0.4rem;
}
</style>
