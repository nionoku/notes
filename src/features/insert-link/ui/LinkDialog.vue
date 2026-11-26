<template>
  <AppDialog
    :title="t('linkDialog.title')"
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <form
      class="dialog-form"
      @submit.prevent="handleSubmit"
    >
      <div class="dialog-form__field">
        <label :for="urlFieldId">{{ t('linkDialog.address') }}</label>
        <input
          :id="urlFieldId"
          ref="urlInput"
          v-model="url"
          name="url"
          type="text"
          inputmode="url"
          autocomplete="off"
          :placeholder="t('linkDialog.addressPlaceholder')"
          autofocus
          required
        />
      </div>
      <div class="dialog-form__field">
        <label :for="textFieldId">{{ t('linkDialog.text') }}</label>
        <input
          :id="textFieldId"
          v-model="text"
          name="text"
          type="text"
          autocomplete="off"
          :placeholder="t('linkDialog.textPlaceholder')"
        />
      </div>
      <div class="form-actions">
        <button type="submit">
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
 * @fileoverview Диалог вставки обычной ссылки.
 */

import { nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import AppDialog from '@/shared/ui/AppDialog.vue';

const props = defineProps<{
  open: boolean;
  initialText?: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  submit: [payload: { readonly url: string; readonly text: string }];
}>();

const { t } = useI18n();
const url = ref('');
const text = ref('');
const urlInput = ref<HTMLInputElement | null>(null);
const fieldId = useId();
const urlFieldId = `${fieldId}-url`;
const textFieldId = `${fieldId}-text`;

watch(
  () => props.open,
  open => {
    if (!open) {
      return;
    }
    url.value = '';
    text.value = props.initialText ?? '';
    void nextTick(() => urlInput.value?.focus());
  },
);

function close(): void {
  emit('update:open', false);
}

function handleSubmit(): void {
  const normalizedUrl = url.value.trim();
  if (!normalizedUrl) {
    return;
  }
  emit('submit', { url: normalizedUrl, text: text.value.trim() });
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
