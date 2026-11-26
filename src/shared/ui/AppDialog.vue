<template>
  <Teleport to="body">
    <dialog
      ref="dialogRef"
      class="app-dialog"
      closedby="any"
      :aria-labelledby="titleId"
      @close="handleClose"
    >
      <div class="app-dialog__header">
        <h2 :id="titleId">
          {{ title }}
        </h2>
        <button
          type="button"
          class="app-dialog__close"
          :aria-label="t('common.close')"
          @click="close"
        >
          <AppIcon
            name="close"
            :size="18"
          />
        </button>
      </div>
      <slot />
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @fileoverview Обёртка над нативным модальным `<dialog>`.
 */

import { nextTick, onMounted, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { useLightDismiss } from '@/shared/lib/light-dismiss';
import AppIcon from '@/shared/ui/AppIcon.vue';

const props = defineProps<{
  title: string;
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);
const titleId = useId();
const { t } = useI18n();

useLightDismiss(dialogRef);

function close(): void {
  dialogRef.value?.close();
}

function handleClose(): void {
  emit('update:open', false);
}

function syncOpenState(value: boolean): void {
  const dialog = dialogRef.value;
  if (!dialog) {
    return;
  }
  if (value && !dialog.open) {
    dialog.showModal();
  } else if (!value && dialog.open) {
    dialog.close();
  }
}

onMounted(() => {
  if (props.open) {
    void nextTick(() => syncOpenState(true));
  }
});

watch(
  () => props.open,
  value => {
    void nextTick(() => syncOpenState(value));
  },
);

defineExpose({ close });
</script>

<style scoped>
.app-dialog {
  inline-size: min(32rem, calc(100% - 2rem));
  max-block-size: calc(100dvh - 2rem);
  margin: auto;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.app-dialog::backdrop {
  background: rgb(0 0 0 / 45%);
}

.app-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-block-end: 1rem;
}

.app-dialog__header h2 {
  margin: 0;
  font-size: 1.125rem;
}

.app-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2rem;
  block-size: 2rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
}

.app-dialog__close:hover {
  color: var(--color-text);
}
</style>
