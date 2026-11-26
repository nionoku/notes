<template>
  <article class="note-card">
    <h2 class="note-card__title">
      <template v-if="hasImported">
        <ImportedMark :size="16" />
      </template>
      <template v-if="isArchived">
        <ArchivedMark :size="16" />
      </template>
      <RouterLink :to="href">{{ note.title }}</RouterLink>
    </h2>
    <template v-if="hasDates">
      <p class="note-card__date">
        <NoteDates
          :created-at="note.createdAt"
          :modified-at="note.modifiedAt"
        />
      </p>
    </template>
    <NoteTags :tags="note.tags" />
    <template v-if="hasDue">
      <p
        class="note-card__due"
        :class="dueClass"
        :aria-label="dueLabel"
      >
        <AppIcon
          name="clock"
          :size="14"
        />
        <time :datetime="note.dueAt">{{ dueTime }}</time>
      </p>
    </template>
    <template v-if="showPath">
      <p class="note-card__path">
        {{ note.dirPath }}
      </p>
    </template>
  </article>
</template>

<script setup lang="ts">
/**
 * @fileoverview Карточка документа в списке.
 */

import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Note } from '@/entities/note/model/note-types';
import NoteDates from '@/entities/note/ui/NoteDates.vue';
import NoteTags from '@/entities/note/ui/NoteTags.vue';
import ImportedMark from '@/shared/ui/ImportedMark.vue';
import ArchivedMark from '@/entities/note/ui/ArchivedMark.vue';
import AppIcon from '@/shared/ui/AppIcon.vue';
import { formatDateTime } from '@/shared/lib/date';
import { documentRoute } from '@/shared/lib/urls';

const props = defineProps<{
  note: Note;
}>();

const { t } = useI18n();
const href = computed(() => documentRoute(props.note.path));
const isArchived = computed(() => props.note.state === 'archived');
const hasImported = computed(() => props.note.imported);
const hasDates = computed(() =>
  Boolean(props.note.createdAt || props.note.modifiedAt),
);
const hasDue = computed(() => Boolean(props.note.dueAt));
const showPath = computed(() =>
  Boolean(props.note.dirPath && props.note.dirPath !== props.note.title),
);
const dueOverdue = computed(() => {
  if (!props.note.dueAt) {
    return false;
  }
  const time = Date.parse(props.note.dueAt);
  return Number.isFinite(time) && time < Date.now();
});
const dueClass = computed(() => ({
  'note-card__due--overdue': dueOverdue.value,
}));
const dueLabel = computed(() =>
  props.note.dueAt
    ? t('noteView.dueLabel', { date: formatDateTime(props.note.dueAt) })
    : '',
);
const dueTime = computed(() =>
  props.note.dueAt ? formatDateTime(props.note.dueAt) : '',
);
</script>

<style scoped>
.note-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-block: 1rem;
  border-block-end: 1px solid var(--color-border);
}

.note-card__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 1.2rem;
  font-weight: 600;
}

.note-card__title a {
  text-decoration: none;
}

.note-card__title a:hover {
  color: var(--color-accent);
}

.note-card__date {
  margin: 0;
}

.note-card__due {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--color-success);
  font-size: 0.8125rem;
  margin-block-start: 0.5rem;
}

.note-card__due--overdue {
  color: var(--color-warning);
}

.note-card__path {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.75rem;
}
</style>
