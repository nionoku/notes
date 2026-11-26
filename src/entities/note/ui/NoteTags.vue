<template>
  <template v-if="hasTags">
    <ul
      class="note-tags"
      :aria-label="t('common.tags')"
    >
      <template
        v-for="item in tagItems"
        :key="item.tag"
      >
        <li
          class="note-tags__item"
          :style="item.style"
        >
          {{ item.tag }}
        </li>
      </template>
    </ul>
  </template>
</template>

<script setup lang="ts">
/**
 * @fileoverview Список тегов документа.
 */

import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { tagHue } from '@/shared/lib/tag-color';

const props = defineProps<{
  tags: readonly string[];
}>();

const { t } = useI18n();
const hasTags = computed(() => props.tags.length > 0);
const tagItems = computed(() =>
  props.tags.map(tag => ({
    tag,
    style: { '--tag-hue': String(tagHue(tag)) },
  })),
);
</script>

<style scoped>
.note-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  padding: 0;
  list-style: none;
  font-size: 0.8125rem;
}

.note-tags__item {
  --tag-color: hsl(var(--tag-hue) var(--tag-saturation) var(--tag-lightness));
  --tag-background: hsl(
    var(--tag-hue) var(--tag-bg-saturation) var(--tag-bg-lightness)
  );

  padding: 0.1rem 0.4rem;
  border: 1px solid var(--tag-color);
  border-radius: 5px;
  background: var(--tag-background);
  color: var(--tag-color);
}
</style>
