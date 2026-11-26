<template>
  <AppDialog
    :title="t('documentLinkDialog.title')"
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <form
      class="dialog-form"
      @submit.prevent="handleSubmit"
    >
      <template v-if="hasNoNotes">
        <p class="hint">
          {{ t('documentLinkDialog.empty') }}
        </p>
      </template>
      <template v-else>
        <div class="dialog-form__field">
          <label :for="documentFieldId">{{
            t('documentLinkDialog.document')
          }}</label>
          <select
            :id="documentFieldId"
            ref="selectInput"
            v-model="selectedPath"
            name="document"
            autofocus
            required
          >
            <template
              v-for="option in noteOptions"
              :key="option.value"
            >
              <option :value="option.value">
                {{ option.label }}
              </option>
            </template>
          </select>
        </div>
        <template v-if="hasHeadings">
          <div class="dialog-form__field">
            <label :for="anchorFieldId">{{
              t('documentLinkDialog.section')
            }}</label>
            <select
              :id="anchorFieldId"
              v-model="anchor"
              name="anchor"
            >
              <option value="">
                {{ t('documentLinkDialog.wholeDocument') }}
              </option>
              <template
                v-for="option in headingOptions"
                :key="option.value"
              >
                <option :value="option.value">
                  {{ option.label }}
                </option>
              </template>
            </select>
          </div>
        </template>
      </template>
      <div class="form-actions">
        <button
          type="submit"
          :disabled="hasNoNotes"
        >
          {{ t('common.insert') }}
        </button>
        <button
          type="button"
          @click="close"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </form>
  </AppDialog>
</template>

<script setup lang="ts">
/**
 * @fileoverview Диалог выбора документа и якоря для обычной markdown-ссылки.
 */

import { computed, nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { useNotesStore } from '@/entities/note/model/note-store';
import { extractHeadings } from '@/shared/lib/markdown-headings';
import AppDialog from '@/shared/ui/AppDialog.vue';

const props = defineProps<{
  open: boolean;
  initialPath?: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  submit: [
    payload: {
      readonly path: string;
      readonly anchor: string;
      readonly title: string;
      readonly anchorTitle: string;
    },
  ];
}>();

const notesStore = useNotesStore();
const { t } = useI18n();
const selectedPath = ref('');
const anchor = ref('');
const selectInput = ref<HTMLSelectElement | null>(null);
const fieldId = useId();
const documentFieldId = `${fieldId}-document`;
const anchorFieldId = `${fieldId}-anchor`;

const notes = computed(() => notesStore.sortedNotes);
const selectedNote = computed(() =>
  notes.value.find(note => note.path === selectedPath.value),
);
const headings = computed(() =>
  selectedNote.value ? extractHeadings(selectedNote.value.body) : [],
);
const hasNoNotes = computed(() => notes.value.length === 0);
const hasHeadings = computed(() => headings.value.length > 0);
const noteOptions = computed(() =>
  notes.value.map(note => ({
    value: note.path,
    label:
      note.path === note.title ? note.title : `${note.title} — ${note.path}`,
  })),
);
const headingOptions = computed(() =>
  headings.value.map(heading => ({
    value: heading.slug,
    label:
      `${t('documentLinkDialog.indent').repeat(Math.max(0, heading.depth - 1))} ${heading.text}`.trim(),
  })),
);

watch(
  () => props.open,
  open => {
    if (!open) {
      return;
    }
    anchor.value = '';
    const initial =
      props.initialPath &&
      notes.value.some(note => note.path === props.initialPath)
        ? props.initialPath
        : (notes.value[0]?.path ?? '');
    selectedPath.value = initial;
    void nextTick(() => selectInput.value?.focus());
  },
);

watch(selectedPath, () => {
  anchor.value = '';
});

function close(): void {
  emit('update:open', false);
}

function handleSubmit(): void {
  const selected = selectedNote.value;
  if (!selected) {
    return;
  }
  const selectedHeading = headings.value.find(
    heading => heading.slug === anchor.value,
  );
  emit('submit', {
    path: selected.path,
    anchor: anchor.value,
    title: selected.title,
    anchorTitle: selectedHeading?.text ?? '',
  });
  close();
}
</script>

<style scoped>
.dialog-form {
  display: grid;
  gap: 1rem;
}

.dialog-form__field {
  display: grid;
  gap: 0.3rem;
}

.dialog-form__field select {
  min-block-size: 2.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-bg);
}

.dialog-form .form-actions {
  margin-block-start: 0.25rem;
}
</style>
