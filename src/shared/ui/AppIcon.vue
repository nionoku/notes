<template>
  <span
    class="app-icon"
    :style="iconStyle"
    aria-hidden="true"
  ></span>
</template>

<script setup lang="ts">
/**
 * @fileoverview Иконки интерфейса из отдельных SVG-файлов.
 */

import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    name: string;
    size?: number;
  }>(),
  { size: 20 },
);

const iconUrl = computed(
  () => `${import.meta.env.BASE_URL}icons/${props.name}.svg`,
);

const iconStyle = computed<Record<string, string>>(() => ({
  '--icon-url': `url("${iconUrl.value}")`,
  inlineSize: `${props.size}px`,
  blockSize: `${props.size}px`,
}));
</script>

<style scoped>
.app-icon {
  display: inline-block;
  flex: none;
  background-color: currentcolor;
  mask: var(--icon-url) no-repeat center / contain;
  vertical-align: middle;
  pointer-events: none;
  forced-color-adjust: none;
}
</style>
