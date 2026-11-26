<template>
  <AppDialog
    :title="t('imageDialog.title')"
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <form
      class="dialog-form"
      @submit.prevent="handleSubmit"
    >
      <div class="dialog-form__field">
        <label :for="fileFieldId">{{ t('imageDialog.file') }}</label>
        <input
          :id="fileFieldId"
          ref="fileInput"
          name="image"
          type="file"
          accept="image/*"
          autofocus
          required
        />
      </div>
      <div class="dialog-form__field">
        <label :for="altFieldId">{{ t('imageDialog.description') }}</label>
        <input
          :id="altFieldId"
          v-model="alt"
          name="alt"
          type="text"
          autocomplete="off"
          :placeholder="t('imageDialog.altPlaceholder')"
        />
      </div>
      <template v-if="hasError">
        <p
          class="form-error"
          role="alert"
        >
          {{ error }}
        </p>
      </template>
      <div class="form-actions">
        <button type="submit">
          {{ t('imageDialog.submit') }}
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
 * @fileoverview Диалог вставки изображения.
 */

import { computed, nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import AppDialog from '@/shared/ui/AppDialog.vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  submit: [payload: { readonly file: File; readonly alt: string }];
}>();

const { t } = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);
const alt = ref('');
const fieldId = useId();
const fileFieldId = `${fieldId}-file`;
const altFieldId = `${fieldId}-alt`;
const error = ref<string | null>(null);
const hasError = computed(() => Boolean(error.value));

watch(
  () => props.open,
  open => {
    if (!open) {
      return;
    }
    alt.value = '';
    error.value = null;
    if (fileInput.value) {
      fileInput.value.value = '';
    }
    void nextTick(() => fileInput.value?.focus());
  },
);

function close(): void {
  emit('update:open', false);
}

function handleSubmit(): void {
  const file = fileInput.value?.files?.[0];
  if (!file) {
    error.value = t('imageDialog.chooseFile');
    return;
  }
  emit('submit', { file, alt: alt.value.trim() });
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

.dialog-form__field input {
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
