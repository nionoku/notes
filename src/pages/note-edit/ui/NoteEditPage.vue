<template>
  <section class="note-edit-page" :aria-labelledby="headingId">
    <header class="page-header">
      <h1 :id="headingId">
        {{ pageTitle }}
      </h1>
    </header>

    <template v-if="showLoading">
      <p role="status">
        {{ t('common.loadingDocument') }}
      </p>
    </template>

    <template v-else-if="showError">
      <div role="alert">
        <p>{{ notesStore.error }}</p>
        <button type="button" class="button-link" @click="retry">
          {{ t('common.retry') }}
        </button>
      </div>
    </template>

    <template v-else-if="showMissing">
      <div class="note-edit-page__missing">
        <h2>{{ t('common.documentNotFound') }}</h2>
        <p>{{ t('common.documentMissing') }}</p>
        <RouterLink class="button-link" :to="listUrl">
          {{ t('common.backToNotes') }}
        </RouterLink>
      </div>
    </template>

    <template v-else-if="initialized">
      <form class="note-form" novalidate @submit.prevent="handleSubmit">
        <div class="note-form__field">
          <label :for="titleFieldId">{{ t('noteEdit.title') }}</label>
          <input
            :id="titleFieldId"
            ref="titleInput"
            :value="title"
            name="title"
            type="text"
            autocomplete="off"
            maxlength="120"
            required
            :aria-describedby="titleHintId"
            :aria-invalid="titleInvalid"
            autofocus
            @input="handleTitleInput"
          />
          <p :id="titleHintId" class="hint">
            {{ t('noteEdit.titleHint') }}
          </p>
        </div>

        <fieldset class="note-form__fieldset">
          <legend>{{ t('common.tags') }}</legend>
          <p :id="tagHintId" class="hint">
            {{ t('noteEdit.tagsHint') }}
          </p>
          <div class="tag-options" :aria-describedby="tagHintId">
            <template v-for="item in tagItems" :key="item.tag">
              <label class="tag-option" :style="item.style">
                <input
                  v-model="selectedTags"
                  class="visually-hidden"
                  type="checkbox"
                  name="tags"
                  :value="item.tag"
                  @change="clearNewTag"
                />

                {{ item.tag }}
              </label>
            </template>
          </div>
          <label class="note-form__custom-tag" :for="newTagFieldId">
            {{ t('noteEdit.newTag') }}
          </label>
          <input
            :id="newTagFieldId"
            v-model="newTag"
            name="newTag"
            type="text"
            autocomplete="off"
            maxlength="50"
            :placeholder="t('noteEdit.newTagPlaceholder')"
            :aria-describedby="tagHintId"
            @keydown="handleTagKeydown"
            @input="handleNewTagInput"
          />
        </fieldset>

        <fieldset class="note-form__fieldset">
          <legend>{{ t('noteEdit.dueLegend') }}</legend>
          <label class="note-form__checkbox">
            <input
              v-model="dueEnabled"
              type="checkbox"
              name="due-enabled"
              @change="handleDueToggle"
            />
            <span>{{ t('noteEdit.dueCheckbox') }}</span>
          </label>
          <template v-if="dueEnabled">
            <div class="note-form__field">
              <label :for="dueId">{{ t('noteEdit.dueField') }}</label>
              <input
                :id="dueId"
                ref="dueInput"
                v-model="dueValue"
                name="due"
                type="datetime-local"
                step="60"
                required
              />
            </div>
          </template>
        </fieldset>

        <MarkdownEditor
          v-model="body"
          :document-path="editorDocumentPath"
          :allow-images="true"
          :upload-image="uploadImage"
        />

        <template v-if="error">
          <p class="form-error" role="alert">
            {{ error }}
          </p>
        </template>
        <template v-if="saving">
          <p class="form-status" role="status">
            {{ t('common.saving') }}
          </p>
        </template>

        <div class="form-actions">
          <button type="submit" :disabled="saving">
            <AppIcon name="save" :size="18" />
            {{ t('common.save') }}
          </button>
          <button type="button" :disabled="saving" @click="handleCancel">
            {{ t('common.cancel') }}
          </button>
        </div>
      </form>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * @fileoverview Создание и редактирование документа.
 */

import {computed, nextTick, ref, useId, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useRoute, useRouter} from 'vue-router';

import {noteRepository} from '@/entities/note/api/note-repository';
import {useNotesStore, describeError} from '@/entities/note/model/note-store';
import {
  sanitizeAssetFileName,
  validateDocumentTitle,
} from '@/entities/note/model/note-path';
import type {PendingAsset} from '@/entities/note/model/note-types';
import {
  formatShortDate,
  fromDateTimeLocal,
  toDateTimeLocal,
} from '@/shared/lib/date';
import {replaceLegacyDocumentLinks} from '@/shared/lib/document-links';
import {tagHue} from '@/shared/lib/tag-color';
import MarkdownEditor from '@/widgets/markdown-editor/ui/MarkdownEditor.vue';
import AppIcon from '@/shared/ui/AppIcon.vue';
import {documentRoute, notesListRoute} from '@/shared/lib/urls';

const props = defineProps<{
  mode: 'create' | 'edit';
  path?: string;
}>();

const notesStore = useNotesStore();
const router = useRouter();
const route = useRoute();
const fieldId = useId();
const {t} = useI18n();

const title = ref('');
const body = ref('');
const selectedTags = ref<string[]>([]);
const newTag = ref('');
const localTags = ref<string[]>([]);
const pendingAssets = ref<PendingAsset[]>([]);
const initialized = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const titleInput = ref<HTMLInputElement | null>(null);
const dueInput = ref<HTMLInputElement | null>(null);
const dueEnabled = ref(false);
const dueValue = ref('');
const dueId = `${fieldId}-due`;
const titleFieldId = `${fieldId}-title`;
const newTagFieldId = `${fieldId}-new-tag`;
const listUrl = notesListRoute();

const isCreate = computed(() => props.mode === 'create');
const note = computed(() =>
  !isCreate.value && props.path ? notesStore.getByPath(props.path) : undefined,
);
const pageTitle = computed(() =>
  isCreate.value ? t('noteEdit.newTitle') : t('noteEdit.editTitle'),
);
const showLoading = computed(
  () =>
    !isCreate.value &&
    (notesStore.status === 'loading' || notesStore.status === 'idle'),
);
const showError = computed(
  () => !isCreate.value && notesStore.status === 'error',
);
const showMissing = computed(
  () => !isCreate.value && notesStore.status === 'ready' && !note.value,
);
const titleInvalid = computed(() => (error.value ? 'true' : undefined));
const editorDocumentPath = computed(() => note.value?.path ?? '');
const tagOptions = computed(() => {
  const tags = new Set(notesStore.allTags);
  for (const tag of localTags.value) {
    tags.add(tag);
  }
  return [...tags].sort((first, second) => first.localeCompare(second, 'ru'));
});
const headingId = `${fieldId}-heading`;
const tagItems = computed(() =>
  tagOptions.value.map(tag => ({
    tag,
    style: {'--tag-hue': String(tagHue(tag))},
  })),
);
const titleHintId = `${fieldId}-title-hint`;
const tagHintId = `${fieldId}-tag-hint`;

function readInheritedTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const tags = new Set<string>();
  for (const item of values) {
    if (typeof item !== 'string') {
      continue;
    }
    const tag = item.trim().replace(/^#+/, '').trim();
    if (tag && tag.length <= 50) {
      tags.add(tag);
    }
  }
  return [...tags];
}

function initialize(): void {
  if (initialized.value) {
    return;
  }

  if (isCreate.value) {
    const inheritedTags = readInheritedTags(route.query['tags']);
    title.value = '';
    body.value = '';
    selectedTags.value = inheritedTags;
    newTag.value = '';
    localTags.value = [...inheritedTags];
    pendingAssets.value = [];
    dueEnabled.value = false;
    dueValue.value = '';
    initialized.value = true;
    return;
  }

  const current = note.value;
  if (!current) {
    return;
  }

  title.value = current.title;
  body.value = replaceLegacyDocumentLinks(current.body, (rawPath, anchor) =>
    notesStore.resolveDocumentLink(rawPath, current.path, anchor),
  );
  selectedTags.value = [...current.tags];
  newTag.value = '';
  localTags.value = [];
  pendingAssets.value = [];
  dueEnabled.value = Boolean(current.dueAt);
  dueValue.value = current.dueAt ? toDateTimeLocal(current.dueAt) : '';
  initialized.value = true;
  void nextTick(() => titleInput.value?.focus());
}

watch(
  [() => props.mode, () => props.path],
  () => {
    initialized.value = false;
    error.value = null;
    initialize();
  },
  {immediate: true},
);

watch([() => notesStore.status, note], () => initialize());

function handleTitleInput(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  if (event instanceof InputEvent && event.isComposing) {
    title.value = input.value;
    return;
  }

  const value = input.value;
  const caret = input.selectionStart ?? value.length;
  const before = value.slice(0, caret);
  const match = /&date $/i.exec(before);
  if (!match) {
    title.value = value;
    return;
  }

  const date = formatShortDate();
  const start = match.index;
  title.value = `${before.slice(0, start)}${date} ${value.slice(caret)}`;
  const nextCaret = start + date.length + 1;
  void nextTick(() => {
    input.setSelectionRange(nextCaret, nextCaret);
  });
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, '').trim();
}

function addTag(tag: string): void {
  if (!tagOptions.value.includes(tag)) {
    localTags.value = [...localTags.value, tag];
  }
  if (!selectedTags.value.includes(tag)) {
    selectedTags.value = [...selectedTags.value, tag];
  }
  newTag.value = '';
  if (error.value === t('noteEdit.tagTooLong')) {
    error.value = null;
  }
}

function commitTag(): void {
  const tag = normalizeTag(newTag.value);
  if (!tag) {
    return;
  }
  if (tag.length > 50) {
    error.value = t('noteEdit.tagTooLong');
    return;
  }
  addTag(tag);
}

function handleTagKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.isComposing) {
    return;
  }
  event.preventDefault();
  commitTag();
}

function clearNewTag(): void {
  newTag.value = '';
}

function handleNewTagInput(): void {
  if (error.value === t('noteEdit.tagTooLong')) {
    error.value = null;
  }
}

function handleDueToggle(): void {
  if (dueEnabled.value && !dueValue.value) {
    dueValue.value = toDateTimeLocal(
      new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
    );
  }
}

function collectTags(): string[] {
  const tags = new Set<string>();
  for (const tag of selectedTags.value) {
    const normalized = tag.trim();
    if (normalized) {
      tags.add(normalized);
    }
  }
  return [...tags];
}

function buildAssetFileName(file: File): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${random}-${sanitizeAssetFileName(file.name)}`;
}

async function uploadImage(file: File): Promise<string> {
  const fileName = buildAssetFileName(file);

  if (isCreate.value) {
    pendingAssets.value = [...pendingAssets.value, {fileName, file}];
    return `assets/${fileName}`;
  }

  const current = note.value;
  if (!current) {
    throw new Error(t('noteEdit.notLoaded'));
  }
  return noteRepository.writeAsset(current.dirPath, file, fileName);
}

async function handleSubmit(): Promise<void> {
  if (saving.value) {
    return;
  }

  error.value = null;
  const validationError = validateDocumentTitle(title.value);
  if (validationError) {
    error.value = validationError;
    void nextTick(() => titleInput.value?.focus());
    return;
  }

  const pendingTag = normalizeTag(newTag.value);
  if (pendingTag.length > 50) {
    error.value = t('noteEdit.tagTooLong');
    return;
  }
  if (pendingTag) {
    addTag(pendingTag);
  }

  let dueAt = '';
  if (dueEnabled.value) {
    if (!dueValue.value) {
      error.value = t('noteEdit.dueRequired');
      void nextTick(() => dueInput.value?.focus());
      return;
    }
    dueAt = fromDateTimeLocal(dueValue.value);
    if (!dueAt) {
      error.value = t('noteEdit.dueRequired');
      void nextTick(() => dueInput.value?.focus());
      return;
    }
  }

  const draft = {
    title: title.value.trim(),
    tags: collectTags(),
    body: body.value,
    dueAt,
  };

  saving.value = true;
  try {
    if (isCreate.value) {
      const created = await notesStore.create(draft, pendingAssets.value);
      pendingAssets.value = [];
      await router.push(documentRoute(created.path));
      return;
    }

    const current = note.value;
    if (!current) {
      throw new Error(t('noteEdit.missing'));
    }
    const updated = await notesStore.save(current, draft);
    await router.push(documentRoute(updated.path));
  } catch (saveError) {
    error.value = describeError(saveError);
  } finally {
    saving.value = false;
  }
}

function handleCancel(): void {
  if (!isCreate.value && note.value) {
    void router.push(documentRoute(note.value.path));
    return;
  }
  void router.push(notesListRoute());
}

function retry(): void {
  void notesStore.loadAll(true);
}
</script>

<style scoped>
.note-edit-page__missing {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  padding-block: 2rem;
}

.note-form {
  display: grid;
  gap: 1.5rem;
}

.note-form__field {
  display: grid;
  gap: 0.3rem;
}

.note-form__field > label,
.note-form__fieldset legend {
  padding: 0;
  font-weight: 600;
}

.note-form__field input,
.note-form__custom-tag + input {
  inline-size: 100%;
  min-block-size: 2.5rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
}

.note-form__field input[aria-invalid='true'] {
  border-color: var(--color-danger);
}

.note-form__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.note-form__checkbox input {
  inline-size: auto;
  accent-color: var(--color-accent);
}

.note-form__fieldset {
  display: grid;
  gap: 0.4rem;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tag-option {
  --tag-color: hsl(var(--tag-hue) var(--tag-saturation) var(--tag-lightness));
  --tag-background: hsl(
    var(--tag-hue) var(--tag-bg-saturation) var(--tag-bg-lightness)
  );
  --tag-background-strong: hsl(
    var(--tag-hue) var(--tag-bg-strong-saturation)
      var(--tag-bg-strong-lightness)
  );

  display: inline-flex;
  align-items: center;
  min-block-size: 2rem;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--tag-color);
  border-radius: 5px;
  background: var(--tag-background);
  color: var(--tag-color);
  font-size: 0.9375rem;
  cursor: pointer;
}

.tag-option:hover {
  background: var(--tag-background-strong);
}

.tag-option:has(input:checked) {
  background: var(--tag-background-strong);
  font-weight: 600;
}

.tag-option:has(input:focus-visible) {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.note-form__custom-tag {
  margin-block-start: 0.4rem;
  font-size: 0.875rem;
}

.note-form__fieldset .hint {
  margin: 0;
}

.form-actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
</style>
