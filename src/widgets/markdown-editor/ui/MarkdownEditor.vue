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

import { computed, ref, useId } from 'vue';
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
}

function handleInput(): void {
  const textarea = textareaRef.value;
  if (!textarea) {
    return;
  }
  emit('update:modelValue', textarea.value);
  syncSelection();
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
  readonly path: string;
  readonly anchor: string;
  readonly title: string;
  readonly anchorTitle: string;
}): void {
  const syntax = buildDocumentLinkMarkdown({
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
</script>

<style scoped>
.markdown-editor {
  display: flex;
  flex-direction: column;
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
