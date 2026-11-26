<template>
  <span
    class="archived-mark"
    role="img"
    :aria-label="t('noteView.archiveLabel')"
    :title="t('noteView.archiveLabel')"
  >
    <AppIcon name="archive" :size="size" />
  </span>
</template>

<script setup lang="ts">
/**
 * @fileoverview Отметка архивного документа.
 */

import {useI18n} from 'vue-i18n';

import AppIcon from '@/shared/ui/AppIcon.vue';

withDefaults(
  defineProps<{
    size?: number;
  }>(),
  {size: 18},
);

const {t} = useI18n();
</script>

<style scoped>
.archived-mark {
  display: inline-flex;
  flex: none;
  color: var(--color-muted);
  align-self: center;
}
</style>
