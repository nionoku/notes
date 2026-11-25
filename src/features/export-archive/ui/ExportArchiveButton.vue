<template>
  <div class="export-archive">
    <button
      type="button"
      class="button-link export-archive__button"
      :disabled="exporting"
      :aria-label="buttonLabel"
      :title="buttonLabel"
      @click="exportArchive"
    >
      <AppIcon name="download" :size="18" />
      <span class="export-archive__label">
        {{ buttonText }}
      </span>
    </button>
    <Teleport to="body">
      <template v-if="hasFeedback">
        <div class="export-archive__feedback">
          <template v-if="hasStatus">
            <p role="status">
              {{ status }}
            </p>
          </template>
          <template v-if="hasError">
            <p role="alert">
              {{ error }}
            </p>
          </template>
        </div>
      </template>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Кнопка выгрузки всех документов в ZIP-архив.
 */

import JSZip from 'jszip';
import {computed, onBeforeUnmount, ref} from 'vue';
import {useI18n} from 'vue-i18n';

import {noteRepository} from '@/entities/note/api/note-repository';
import {downloadBlob, todayFileStamp} from '@/shared/lib/download';
import {translatePlural} from '@/shared/i18n';
import AppIcon from '@/shared/ui/AppIcon.vue';

const {t} = useI18n();
const exporting = ref(false);
const status = ref('');
const error = ref<string | null>(null);
const hasFeedback = computed(() => Boolean(status.value || error.value));
const hasStatus = computed(() => Boolean(status.value));
const hasError = computed(() => Boolean(error.value));
const buttonLabel = computed(() =>
  exporting.value
    ? t('exportArchive.collectingTitle')
    : t('exportArchive.button'),
);
const buttonText = computed(() =>
  exporting.value ? t('exportArchive.collecting') : t('exportArchive.button'),
);
let statusTimer: number | undefined;
let errorTimer: number | undefined;

function showStatus(message: string): void {
  window.clearTimeout(statusTimer);
  status.value = message;
  statusTimer = window.setTimeout(() => {
    status.value = '';
  }, 5_000);
}

function showError(message: string): void {
  window.clearTimeout(errorTimer);
  error.value = message;
  errorTimer = window.setTimeout(() => {
    error.value = '';
  }, 8_000);
}

onBeforeUnmount(() => {
  window.clearTimeout(statusTimer);
  window.clearTimeout(errorTimer);
});

async function exportArchive(): Promise<void> {
  if (exporting.value) {
    return;
  }

  exporting.value = true;
  error.value = null;
  showStatus(t('exportArchive.collectingStatus'));

  try {
    const files = await noteRepository.listAllFiles();
    if (files.length === 0) {
      showStatus(t('exportArchive.empty'));
      return;
    }

    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.path, file.file, {
        date: new Date(file.file.lastModified || Date.now()),
      });
    }

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {level: 6},
    });
    downloadBlob(blob, `notes-${todayFileStamp()}.zip`);
    const filesLabel = translatePlural('exportArchive.files', files.length);
    showStatus(
      t('exportArchive.ready', {count: files.length, files: filesLabel}),
    );
  } catch (archiveError) {
    status.value = '';
    showError(
      archiveError instanceof Error
        ? archiveError.message
        : t('exportArchive.error'),
    );
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.export-archive {
  display: inline-flex;
  align-items: center;
}

.export-archive button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.export-archive__feedback {
  position: fixed;
  z-index: 10;
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

.export-archive__feedback p {
  margin: 0;
}

.export-archive__feedback [role='alert'] {
  color: var(--color-danger);
}
</style>
