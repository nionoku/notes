<template>
  <section
    class="notes-page"
    :aria-labelledby="headingId"
  >
    <template v-if="showError">
      <div role="alert">
        <p>{{ notesStore.error }}</p>
        <button
          type="button"
          class="button-link"
          @click="retry"
        >
          {{ t('common.retry') }}
        </button>
      </div>
    </template>

    <template v-else-if="showEmpty">
      <div class="notes-page__empty">
        <h2>{{ t('notesList.emptyTitle') }}</h2>
        <p>{{ t('notesList.emptyHint') }}</p>
        <RouterLink
          class="button-link"
          :to="createUrl"
        >
          {{ t('notesList.create') }}
        </RouterLink>
      </div>
    </template>

    <template v-else-if="showContent">
      <div class="notes-page__content">
        <NotesSearch
          :query="query"
          :tags="notesStore.allTags"
          :selected-tags="selectedTags"
          :show-archived="showArchived"
          @update:query="updateQuery"
          @toggle-tag="toggleTag"
          @update:show-archived="updateShowArchived"
        />

        <template v-if="isAnchorMode">
          <template v-if="hasAnchorResults">
            <ol class="anchor-results">
              <template
                v-for="item in anchorItems"
                :key="item.key"
              >
                <li>
                  <RouterLink
                    class="anchor-result"
                    :to="item.href"
                  >
                    <span class="anchor-result__heading">{{
                      item.heading
                    }}</span>
                    <span class="anchor-result__note">{{ item.note }}</span>
                  </RouterLink>
                </li>
              </template>
            </ol>
          </template>
          <template v-else>
            <div class="notes-page__empty">
              <h2>{{ t('search.noAnchorsTitle') }}</h2>
              <p>{{ t('search.noAnchorsHint') }}</p>
            </div>
          </template>
        </template>

        <template v-else-if="hasNotes">
          <ol class="notes-list">
            <template
              v-for="note in searchResult.notes"
              :key="note.path"
            >
              <li>
                <NoteCard :note="note" />
              </li>
            </template>
          </ol>
        </template>

        <template v-else>
          <div class="notes-page__empty">
            <h2>{{ t('search.noResultsTitle') }}</h2>
            <p>{{ t('search.noResultsHint') }}</p>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * @fileoverview Список записей базы знаний.
 */

import { computed, onMounted, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';

import NoteCard from '@/entities/note/ui/NoteCard.vue';
import NotesSearch from '@/features/search-notes/ui/NotesSearch.vue';
import { searchDocuments } from '@/features/search-notes/model/search-notes';
import { useNotesStore } from '@/entities/note/model/note-store';
import { useDriveSyncStore } from '@/features/sync-drive/model/drive-sync-store';
import { createDocumentRoute, documentRoute } from '@/shared/lib/urls';

const notesStore = useNotesStore();
const syncStore = useDriveSyncStore();
const headingId = useId();
const { t } = useI18n();
const query = ref('');
const selectedTags = ref<string[]>([]);
const showArchived = ref(false);
const visibleNotes = computed(() =>
  showArchived.value
    ? notesStore.sortedNotes
    : notesStore.sortedNotes.filter(note => note.state === 'active'),
);
const searchResult = computed(() =>
  searchDocuments(visibleNotes.value, query.value, selectedTags.value),
);
const showError = computed(() => notesStore.status === 'error');
const showEmpty = computed(() => notesStore.isEmpty);
const showContent = computed(
  () => notesStore.status === 'ready' || notesStore.sortedNotes.length > 0,
);
const isAnchorMode = computed(() => searchResult.value.mode === 'anchor');
const hasAnchorResults = computed(() => searchResult.value.anchors.length > 0);
const anchorItems = computed(() =>
  searchResult.value.anchors.map(result => ({
    key: `${result.note.path}#${result.heading.slug}`,
    href: documentRoute(result.note.path, result.heading.slug),
    heading: result.heading.text,
    note: result.note.title,
  })),
);
const hasNotes = computed(() => searchResult.value.notes.length > 0);
const createUrl = createDocumentRoute();

onMounted(() => {
  syncStore.flushPendingTaskSync();
});

function updateQuery(value: string): void {
  query.value = value;
}

function updateShowArchived(value: boolean): void {
  showArchived.value = value;
}

function toggleTag(tag: string): void {
  selectedTags.value = selectedTags.value.includes(tag)
    ? selectedTags.value.filter(item => item !== tag)
    : [...selectedTags.value, tag];
}

function retry(): void {
  void notesStore.loadAll(true);
}
</script>

<style scoped>
.notes-page {
  display: grid;
  gap: 2rem;
}

.notes-page__content {
  display: grid;
  gap: 1rem;
}

.notes-list {
  display: grid;
  padding: 0;
  list-style: none;
}

.anchor-results {
  display: grid;
  padding: 0;
  border-block-start: 1px solid var(--color-border);
  list-style: none;
}

.anchor-results li {
  border-block-end: 1px solid var(--color-border);
}

.anchor-result {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.65rem;
  padding-block: 0.75rem;
  text-decoration: none;
}

.anchor-result__heading {
  font-weight: 600;
}

.anchor-result__note {
  color: var(--color-muted);
  font-size: 0.8125rem;
}

.anchor-result:hover .anchor-result__heading {
  color: var(--color-accent);
}

.notes-page__empty {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  padding-block: 2rem;
}

.notes-page__empty h2 {
  font-size: 1.25rem;
}
</style>
