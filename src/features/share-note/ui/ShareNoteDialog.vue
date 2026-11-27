<template>
  <AppDialog
    :open="open"
    :title="t('shareNote.title')"
    @update:open="emit('update:open', $event)"
  >
    <p class="hint">
      {{ t('shareNote.description') }}
    </p>
    <p class="hint">
      {{ t('shareNote.privacy') }}
    </p>

    <template v-if="loading">
      <p
        class="form-status"
        role="status"
      >
        {{ t('shareNote.loading') }}
      </p>
    </template>
    <template v-else-if="error">
      <p
        class="form-error"
        role="alert"
      >
        {{ error }}
      </p>
    </template>
    <template v-else-if="link">
      <div class="share-note__field">
        <label :for="linkFieldId">{{ t('shareNote.linkLabel') }}</label>
        <textarea
          :id="linkFieldId"
          ref="linkRef"
          class="share-note__link"
          :value="link"
          readonly
          rows="5"
          spellcheck="false"
          wrap="soft"
          @focus="selectLink"
        ></textarea>
      </div>

      <p
        v-if="warning"
        class="hint"
        role="status"
      >
        {{ t('shareNote.warning') }}
      </p>
      <p
        v-if="copyMessage"
        class="hint"
        :class="{ 'share-note__copy-error': copyFailed }"
        role="status"
      >
        {{ copyMessage }}
      </p>
      <p
        v-if="shareError"
        class="form-error"
        role="alert"
      >
        {{ shareError }}
      </p>

      <div class="form-actions">
        <button
          v-if="canNativeShare"
          type="button"
          :class="{ 'share-note__primary': !copyPrimary }"
          :disabled="sharing"
          @click="shareNative"
        >
          {{ t('shareNote.share') }}
        </button>
        <button
          ref="copyButtonRef"
          type="button"
          :class="{ 'share-note__primary': copyPrimary }"
          @click="copy"
        >
          {{ t('shareNote.copy') }}
        </button>
        <button
          type="button"
          class="button-link"
          @click="close"
        >
          {{ t('common.close') }}
        </button>
      </div>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
/**
 * @fileoverview Диалог «Поделиться заметкой»: ссылка для импорта и копирование.
 */

import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Note } from '@/entities/note/model/note-types';
import {
  createShareLink,
  SHARE_URL_WARNING_LENGTH,
} from '@/features/share-note/model/share-note';
import AppDialog from '@/shared/ui/AppDialog.vue';

const props = defineProps<{
  open: boolean;
  note: Note;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();
const linkFieldId = `share-note-link-${useId()}`;
const linkRef = ref<HTMLTextAreaElement | null>(null);
const link = ref('');
const error = ref('');
const loading = ref(false);
const copyMessage = ref('');
const copyFailed = ref(false);
const sharing = ref(false);
const shareError = ref('');
const copyButtonRef = ref<HTMLButtonElement | null>(null);
const canNativeShare =
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';
const copyPrimary = computed(
  () => !canNativeShare || Boolean(shareError.value),
);
const warning = computed(() => link.value.length > SHARE_URL_WARNING_LENGTH);
let generation = 0;

async function generate(): Promise<void> {
  const token = (generation += 1);
  link.value = '';
  error.value = '';
  loading.value = true;
  copyMessage.value = '';
  copyFailed.value = false;
  sharing.value = false;
  shareError.value = '';
  try {
    const url = await createShareLink(props.note);
    if (token !== generation) {
      return;
    }
    link.value = url;
  } catch (linkError) {
    if (token !== generation) {
      return;
    }
    error.value =
      linkError instanceof Error ? linkError.message : t('shareNote.error');
  } finally {
    if (token === generation) {
      loading.value = false;
    }
  }
}

watch(
  () => props.open,
  open => {
    if (!open) {
      generation += 1;
      return;
    }
    void generate();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  generation += 1;
});

function close(): void {
  emit('update:open', false);
}

function selectLink(): void {
  linkRef.value?.select();
}

async function copy(): Promise<void> {
  copyMessage.value = '';
  copyFailed.value = false;
  try {
    await navigator.clipboard.writeText(link.value);
    copyMessage.value = t('shareNote.copied');
  } catch {
    copyFailed.value = true;
    copyMessage.value = t('shareNote.copyError');
    linkRef.value?.focus();
    linkRef.value?.select();
  }
}

/**
 * Вызывает системное окно шаринга. `navigator.share` вызывается синхронно:
 * Safari требует user activation и не принимает вызов после `await`.
 */
async function shareNative(): Promise<void> {
  if (!canNativeShare || !link.value || sharing.value) {
    return;
  }

  shareError.value = '';
  sharing.value = true;
  try {
    await navigator.share({
      title: props.note.title,
      url: link.value,
    });
    close();
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      return;
    }
    shareError.value = t('shareNote.shareError');
    await nextTick();
    copyButtonRef.value?.focus();
  } finally {
    sharing.value = false;
  }
}
</script>

<style scoped>
.share-note__field {
  display: grid;
  gap: 0.35rem;
  margin-block: 1rem;
}

.share-note__link {
  inline-size: 100%;
  min-block-size: 6.5rem;
  padding: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  resize: vertical;
}

.share-note__copy-error {
  color: var(--color-danger);
}

.share-note__primary {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-surface);
}

.share-note__primary:hover {
  color: var(--color-surface);
  filter: brightness(0.95);
}
</style>
