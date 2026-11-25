<template>
  <button
    type="button"
    class="button-link import-notes__button"
    :disabled="busy"
    :title="t('importNotes.button')"
    @click="openPicker"
  >
    <AppIcon name="upload" :size="18" />
    <span>{{ buttonText }}</span>
  </button>
  <input
    ref="inputRef"
    class="visually-hidden import-notes__input"
    type="file"
    accept=".zip,.md,text/markdown,application/zip"
    :aria-label="t('importNotes.inputLabel')"
    multiple
    tabindex="-1"
    @change="handleChange"
  />
  <Teleport to="body">
    <template v-if="hasFeedback">
      <div
        class="import-notes__feedback"
        :class="feedbackClass"
        :role="feedbackRole"
      >
        {{ feedbackText }}
      </div>
    </template>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @fileoverview Кнопка импорта markdown и ZIP.
 */

import {computed, onBeforeUnmount, ref} from 'vue';
import {useI18n} from 'vue-i18n';

import {importNotes} from '@/features/import-note/model/import-notes';
import {useNotesStore} from '@/entities/note/model/note-store';
import AppIcon from '@/shared/ui/AppIcon.vue';

const notesStore = useNotesStore();
const {t} = useI18n();
const inputRef = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const status = ref('');
const error = ref<string | null>(null);
const hasFeedback = computed(() => Boolean(status.value || error.value));
const buttonText = computed(() =>
  busy.value ? t('importNotes.busy') : t('importNotes.button'),
);
const feedbackClass = computed(() => ({
  'import-notes__feedback--error': Boolean(error.value),
}));
const feedbackRole = computed(() => (error.value ? 'alert' : 'status'));
const feedbackText = computed(() => error.value || status.value);
let timer: number | undefined;

function setMessage(message: string, failed = false): void {
  window.clearTimeout(timer);
  status.value = message;
  error.value = failed ? message : null;
  timer = window.setTimeout(() => {
    status.value = '';
    error.value = null;
  }, 6_000);
}

function openPicker(): void {
  if (busy.value) {
    return;
  }
  inputRef.value?.click();
}

async function handleChange(event: Event): Promise<void> {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  const files = [...(input.files ?? [])];
  input.value = '';
  if (files.length === 0) {
    return;
  }

  busy.value = true;
  status.value = '';
  error.value = null;
  try {
    const summary = await importNotes(files);
    await notesStore.loadAll(true);
    const messageKey =
      summary.skipped > 0
        ? 'importNotes.summarySkipped'
        : 'importNotes.summary';
    setMessage(
      t(messageKey, {
        documents: summary.documents,
        files: summary.files,
        skipped: summary.skipped,
      }),
    );
  } catch (importError) {
    setMessage(
      importError instanceof Error
        ? importError.message
        : t('importNotes.error'),
      true,
    );
  } finally {
    busy.value = false;
  }
}

onBeforeUnmount(() => {
  window.clearTimeout(timer);
});
</script>

<style scoped>
.import-notes__button {
  display: flex;
  inline-size: 100%;
  min-block-size: 2.5rem;
  justify-content: flex-start;
  gap: 0.4rem;
  padding: 0.55rem 0.6rem;
  border: 0;
  border-radius: 0.25rem;
  background: none;
  color: var(--color-text);
  font: inherit;
  text-align: start;
}

.import-notes__button:hover {
  background: var(--color-accent-soft);
}

.import-notes__button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.import-notes__feedback {
  position: fixed;
  z-index: 11;
  inset-block-end: 1rem;
  inset-inline-end: 1rem;
  max-inline-size: min(22rem, calc(100% - 2rem));
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  box-shadow: 0 8px 24px rgb(0 0 0 / 15%);
  color: var(--color-text);
  font-size: 0.875rem;
}

.import-notes__feedback--error {
  color: var(--color-danger);
}
</style>
