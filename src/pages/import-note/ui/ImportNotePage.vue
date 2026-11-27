<template>
  <section
    class="import-note-page"
    :aria-labelledby="headingId"
  >
    <header class="page-header">
      <h1 :id="headingId">{{ t('importNote.title') }}</h1>
    </header>

    <template v-if="loading">
      <p
        class="form-status"
        role="status"
      >
        {{ t('importNote.loading') }}
      </p>
    </template>
    <template v-else-if="error">
      <p
        class="form-error"
        role="alert"
      >
        {{ error }}
      </p>
      <p>
        <RouterLink
          class="button-link"
          :to="listUrl"
          replace
        >
          {{ t('common.backToNotes') }}
        </RouterLink>
      </p>
    </template>
    <template v-else-if="payload">
      <p class="hint">
        {{ t('importNote.description') }}
      </p>

      <article class="import-note-page__preview">
        <h2>{{ payload.title }}</h2>
        <NoteTags :tags="payload.tags" />
        <p
          v-if="payload.dueAt"
          class="hint"
        >
          {{ t('importNote.due', { date: dueLabel }) }}
        </p>
        <p
          v-if="imageCount > 0"
          class="hint"
        >
          {{ t('importNote.photos', { count: imageCount }) }}
        </p>
        <p
          v-if="otherAssetCount > 0"
          class="hint"
        >
          {{ t('importNote.otherFiles', { count: otherAssetCount }) }}
        </p>
        <p
          v-if="excerpt"
          class="import-note-page__excerpt"
        >
          {{ excerpt }}
        </p>
      </article>

      <p
        v-if="importError"
        class="form-error"
        role="alert"
      >
        {{ importError }}
      </p>

      <div class="form-actions">
        <button
          type="button"
          :disabled="importing"
          @click="importNote"
        >
          {{ importing ? t('importNote.importing') : t('importNote.import') }}
        </button>
        <RouterLink
          v-if="!importing"
          class="button-link"
          :to="listUrl"
          replace
        >
          {{ t('common.cancel') }}
        </RouterLink>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * @fileoverview Импорт одной заметки из ссылки `/shared?note=...`.
 */

import { computed, nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import { DocumentExistsError } from '@/entities/note/api/note-repository';
import { useNotesStore } from '@/entities/note/model/note-store';
import type { Note } from '@/entities/note/model/note-types';
import NoteTags from '@/entities/note/ui/NoteTags.vue';
import {
  decodeSharedNote,
  prepareSharedNoteImport,
  sharedCopyTitle,
  type SharedNotePayload,
} from '@/features/share-note/model/share-note';
import { formatDateTime } from '@/shared/lib/date';
import { noteRoute, notesListRoute } from '@/shared/lib/urls';

const route = useRoute();
const router = useRouter();
const notesStore = useNotesStore();
const { t } = useI18n();
const headingId = useId();
const listUrl = notesListRoute();

const loading = ref(true);
const error = ref('');
const payload = ref<SharedNotePayload | null>(null);
const importing = ref(false);
const importError = ref('');

const encoded = computed(() => {
  const value = route.query['note'];
  return typeof value === 'string' ? value : '';
});

const dueLabel = computed(() =>
  payload.value?.dueAt ? formatDateTime(payload.value.dueAt) : '',
);

const imageCount = computed(
  () =>
    payload.value?.assets.filter(
      asset =>
        asset.type.startsWith('image/') ||
        /\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(asset.path),
    ).length ?? 0,
);

const otherAssetCount = computed(
  () => (payload.value?.assets.length ?? 0) - imageCount.value,
);

const excerpt = computed(() => {
  const body = (payload.value?.body ?? '')
    .slice(0, 4_000)
    .replace(/\s+/g, ' ')
    .trim();
  return body.length > 320 ? `${body.slice(0, 320)}…` : body;
});

async function load(value: string): Promise<void> {
  loading.value = true;
  error.value = '';
  payload.value = null;
  importError.value = '';
  await nextTick();

  if (!value) {
    error.value = t('importNote.missing');
    loading.value = false;
    return;
  }

  try {
    payload.value = decodeSharedNote(value);
  } catch (decodeError) {
    error.value =
      decodeError instanceof Error
        ? decodeError.message
        : t('importNote.invalidLink');
  } finally {
    loading.value = false;
  }
}

watch(
  encoded,
  value => {
    void load(value);
  },
  { immediate: true },
);

async function importNote(): Promise<void> {
  const current = payload.value;
  if (!current || importing.value) {
    return;
  }

  importing.value = true;
  importError.value = '';
  try {
    await notesStore.loadAll();
    const { draft, assets } = prepareSharedNoteImport(current);
    let created: Note | null = null;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const title =
        attempt === 0 ? draft.title : sharedCopyTitle(draft.title, attempt);
      try {
        created = await notesStore.create({ ...draft, title }, assets);
        break;
      } catch (createError) {
        if (!(createError instanceof DocumentExistsError)) {
          throw createError;
        }
      }
    }

    if (!created) {
      throw new Error(t('importNote.importError'));
    }
    await router.replace(noteRoute(created.id));
  } catch (failure) {
    importError.value =
      failure instanceof Error ? failure.message : t('importNote.importError');
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped>
.import-note-page__preview {
  display: grid;
  gap: 0.5rem;
  margin-block: 1rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
}

.import-note-page__preview h2 {
  margin: 0;
  font-size: 1.25rem;
  overflow-wrap: anywhere;
}

.import-note-page__excerpt {
  margin: 0;
  color: var(--color-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
