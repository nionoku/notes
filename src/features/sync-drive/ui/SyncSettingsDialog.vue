<template>
  <AppDialog
    :title="t('sync.settings.title')"
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <form
      class="sync-form"
      @submit.prevent="save"
    >
      <p class="hint">
        {{ t('sync.settings.hintBefore')
        }}<code>{{ t('sync.settings.drivePath') }}</code
        >{{ t('sync.settings.hintAfter') }}
      </p>

      <div class="sync-form__field">
        <label :for="urlFieldId">{{ t('sync.settings.url') }}</label>
        <input
          :id="urlFieldId"
          v-model="url"
          name="driveUrl"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('sync.settings.urlPlaceholder')"
          autofocus
          required
        />
      </div>

      <div class="sync-form__field">
        <label :for="tokenFieldId">{{ t('sync.settings.token') }}</label>
        <input
          :id="tokenFieldId"
          v-model="token"
          name="driveToken"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('sync.settings.tokenPlaceholder')"
          required
        />
        <p class="hint">
          {{ t('sync.settings.tokenHintBefore')
          }}<code>{{ t('sync.settings.tokenQuery') }}</code
          >{{ t('sync.settings.tokenHintAfter') }}
        </p>
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
          {{ t('common.save') }}
        </button>
        <button
          type="button"
          @click="close"
        >
          {{ t('common.cancel') }}
        </button>
        <template v-if="isConfigured">
          <button
            type="button"
            class="sync-form__clear"
            @click="clear"
          >
            {{ t('sync.settings.clear') }}
          </button>
        </template>
      </div>
    </form>
  </AppDialog>
</template>

<script setup lang="ts">
/**
 * @fileoverview Настройки доступа к Google Apps Script.
 */

import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { useDriveSyncStore } from '@/features/sync-drive/model/drive-sync-store';
import AppDialog from '@/shared/ui/AppDialog.vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const syncStore = useDriveSyncStore();
const { t } = useI18n();
const fieldId = useId();
const urlFieldId = `${fieldId}-url`;
const tokenFieldId = `${fieldId}-token`;
const url = ref('');
const token = ref('');
const error = ref<string | null>(null);
const hasError = computed(() => Boolean(error.value));
const isConfigured = computed(() => syncStore.configured);

watch(
  () => props.open,
  open => {
    if (!open) {
      return;
    }
    url.value = syncStore.config.url;
    token.value = syncStore.config.token;
    error.value = null;
  },
);

function close(): void {
  emit('update:open', false);
}

function save(): void {
  const normalizedUrl = url.value.trim();
  const normalizedToken = token.value.trim();

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    error.value = t('sync.settings.errorUrl');
    return;
  }
  if (parsed.protocol !== 'https:') {
    error.value = t('sync.settings.errorHttps');
    return;
  }
  if (!normalizedToken) {
    error.value = t('sync.settings.errorToken');
    return;
  }

  syncStore.configure({ url: normalizedUrl, token: normalizedToken });
  close();
}

function clear(): void {
  syncStore.clear();
  close();
}
</script>

<style scoped>
.sync-form {
  display: grid;
  gap: 1rem;
}

.sync-form__field {
  display: grid;
  gap: 0.3rem;
}

.sync-form__field input {
  inline-size: 100%;
  min-block-size: 2.5rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-bg);
  color: var(--color-text);
}

.sync-form .form-actions {
  margin-block-start: 0.25rem;
}

.sync-form__clear {
  margin-inline-start: auto;
  color: var(--color-danger);
}

@media (width <=32rem) {
  .sync-form__clear {
    margin-inline-start: 0;
  }
}
</style>
