<template>
  <form
    class="notes-search"
    role="search"
    :aria-label="t('search.label')"
    @submit.prevent
  >
    <label class="notes-search__label" :for="inputId">
      {{ t('search.label') }}
    </label>
    <input
      :id="inputId"
      class="notes-search__input"
      type="search"
      name="notes-search"
      :value="query"
      :placeholder="t('search.placeholder')"
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="search"
      @input="handleInput"
    />
    <template v-if="hasTags">
      <div
        class="notes-search__tags"
        role="group"
        :aria-label="t('search.tags')"
      >
        <template v-for="item in tagItems" :key="item.tag">
          <button
            type="button"
            class="notes-search__tag"
            :style="item.style"
            :aria-pressed="item.pressed"
            @click="emit('toggle-tag', item.tag)"
          >
            {{ item.tag }}
          </button>
        </template>
      </div>
    </template>
  </form>
</template>

<script setup lang="ts">
/**
 * @fileoverview Строка поиска и фильтр по тегам.
 */

import {computed, useId} from 'vue';
import {useI18n} from 'vue-i18n';

import {tagHue} from '@/shared/lib/tag-color';

const props = defineProps<{
  query: string;
  tags: readonly string[];
  selectedTags: readonly string[];
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'toggle-tag': [tag: string];
}>();

const {t} = useI18n();
const inputId = useId();
const hasTags = computed(() => props.tags.length > 0);
const tagItems = computed(() =>
  props.tags.map(tag => ({
    tag,
    style: {'--tag-hue': String(tagHue(tag))},
    pressed: props.selectedTags.includes(tag),
  })),
);

function handleInput(event: Event): void {
  const input = event.target;
  if (input instanceof HTMLInputElement) {
    emit('update:query', input.value);
  }
}
</script>

<style scoped>
.notes-search {
  display: grid;
  gap: 0.55rem;
}

.notes-search__label {
  font-weight: 600;
}

.notes-search__input {
  inline-size: 100%;
  min-block-size: 2.5rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.notes-search__tags {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.4rem;
  padding-block-end: 0.25rem;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  scroll-padding-inline: 0.5rem;
}

.notes-search__tag {
  --tag-color: hsl(var(--tag-hue) var(--tag-saturation) var(--tag-lightness));
  --tag-background: hsl(
    var(--tag-hue) var(--tag-bg-saturation) var(--tag-bg-lightness)
  );

  flex: 0 0 auto;
  padding: 0.25rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.875rem;
  white-space: nowrap;
  cursor: pointer;
}

.notes-search__tag[aria-pressed='true'] {
  border-color: var(--tag-color);
  background: var(--tag-background);
  color: var(--tag-color);
}
</style>
