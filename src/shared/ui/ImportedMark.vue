<template>
  <span
    class="imported-mark"
    role="img"
    :aria-label="t('imported.label')"
    :title="t('imported.label')"
  >
    <AppIcon name="info" :size="size" />
  </span>
</template>

<script setup lang="ts">
/**
 * @fileoverview Отметка импортированного документа.
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
.imported-mark {
  display: inline-flex;
  flex: none;
  color: var(--color-info);
  align-self: center;
}
</style>
