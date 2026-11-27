<template>
  <header class="app-header">
    <div class="app-header__inner">
      <template v-if="isHome">
        <RouterLink
          class="app-header__brand"
          :to="listUrl"
        >
          <img
            class="app-header__logo"
            :src="logoUrl"
            alt=""
            width="24"
            height="24"
          />
          <span>{{ t('app.name') }}</span>
        </RouterLink>
      </template>
      <template v-else>
        <RouterLink
          class="app-header__back"
          :to="listUrl"
          replace
        >
          <AppIcon
            name="arrow-left"
            :size="16"
          />
          {{ t('header.back') }}
        </RouterLink>
      </template>
      <nav
        class="app-header__nav"
        :aria-label="t('header.navigation')"
      >
        <template v-if="showNewNoteOptions">
          <div class="app-header__new-group">
            <RouterLink
              class="button-link app-header__new"
              :to="createUrl"
              :aria-label="t('header.newNote')"
              :title="t('header.newNote')"
            >
              <AppIcon
                name="plus"
                :size="18"
              />
              <span class="app-header__new-label">{{
                t('header.newNote')
              }}</span>
            </RouterLink>
            <button
              type="button"
              class="button-link app-header__new-options"
              :popovertarget="menuId"
              :aria-label="t('header.newNoteOptions')"
              :title="t('header.newNoteOptions')"
            >
              <AppIcon
                name="chevron-down"
                :size="16"
              />
            </button>
            <div
              :id="menuId"
              ref="menuRef"
              class="app-header__new-menu"
              popover="auto"
              :aria-label="t('header.newNoteOptions')"
            >
              <RouterLink
                class="app-header__new-menu-item"
                :to="createWithTagsUrl"
                @click="hideNewNoteMenu"
              >
                <span class="app-header__new-menu-label">
                  {{ t('header.newNote') }}
                </span>
                <span class="app-header__new-menu-caption">
                  {{ t('header.inheritTags') }}
                </span>
              </RouterLink>
            </div>
          </div>
        </template>
        <template v-else>
          <RouterLink
            class="button-link app-header__new"
            :to="createUrl"
            :aria-label="t('header.newNote')"
            :title="t('header.newNote')"
          >
            <AppIcon
              name="plus"
              :size="18"
            />
            <span class="app-header__new-label">{{ t('header.newNote') }}</span>
          </RouterLink>
        </template>
        <SyncMenu>
          <ExportArchiveButton />
          <ImportNotesButton />
          <InstallAppButton />
        </SyncMenu>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * @fileoverview Шапка приложения.
 */

import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import ExportArchiveButton from '@/features/export-archive/ui/ExportArchiveButton.vue';
import ImportNotesButton from '@/features/import-note/ui/ImportNotesButton.vue';
import InstallAppButton from '@/features/pwa-install/ui/InstallAppButton.vue';
import SyncMenu from '@/features/sync-drive/ui/SyncMenu.vue';
import { useNotesStore } from '@/entities/note/model/note-store';
import AppIcon from '@/shared/ui/AppIcon.vue';
import {
  createDocumentRoute,
  createDocumentRouteWithTags,
  notesListRoute,
} from '@/shared/lib/urls';

const baseUrl = import.meta.env.BASE_URL;
const route = useRoute();
const notesStore = useNotesStore();
const { t } = useI18n();
const listUrl = notesListRoute();
const createUrl = createDocumentRoute();
const logoUrl = `${baseUrl}favicon.svg`;
const menuId = `new-note-menu-${useId()}`;
const menuRef = ref<HTMLElement | null>(null);
const isHome = computed(() => route.name === 'notes-list');

const currentNote = computed(() =>
  route.name === 'note-view'
    ? notesStore.getById(
        typeof route.params['id'] === 'string' ? route.params['id'] : '',
      )
    : undefined,
);
const inheritedTags = computed(() => currentNote.value?.tags ?? []);
const showNewNoteOptions = computed(() => inheritedTags.value.length > 0);
const createWithTagsUrl = computed(() =>
  createDocumentRouteWithTags(inheritedTags.value),
);

function hideNewNoteMenu(): void {
  menuRef.value?.hidePopover();
}

watch(
  () => route.fullPath,
  () => hideNewNoteMenu(),
);
</script>

<style scoped>
.app-header {
  border-block-end: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 92%, transparent);
}

.app-header__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  inline-size: min(100% - 2rem, var(--content-width));
  margin-inline: auto;
  padding-block: 0.75rem;
}

.app-header__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-decoration: none;
}

.app-header__logo {
  inline-size: 1.5rem;
  block-size: 1.5rem;
}

.app-header__back {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-block-size: 2.5rem;
  color: var(--color-muted);
  font-size: 0.9375rem;
  text-decoration: none;
}

.app-header__back:hover {
  color: var(--color-accent);
}

.app-header__nav {
  display: flex;
  gap: 0.75rem;
}

.app-header__new-group {
  display: flex;
  align-items: stretch;
  gap: 0.15rem;
}

.app-header__new-options {
  inline-size: 2rem;
  padding: 0;
  justify-content: center;
  anchor-name: --new-note-options;
}

.app-header__new-menu {
  position: fixed;
  inset: auto;
  inset-block-start: 4.25rem;
  inset-inline-end: 1rem;
  inline-size: min(16rem, calc(100vw - 2rem));
  margin: 0;
  padding: 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 12px 32px rgb(0 0 0 / 18%);
}

@supports (anchor-name: --new-note-options) {
  .app-header__new-menu {
    position-anchor: --new-note-options;
    inset-block-start: calc(anchor(--new-note-options bottom) + 0.35rem);
    inset-inline: anchor(--new-note-options right) auto;
    transform: translateX(-100%);
  }
}

.app-header__new-menu-item {
  display: grid;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  color: var(--color-text);
  text-decoration: none;
}

.app-header__new-menu-label {
  font-size: 0.875rem;
  font-weight: 600;
}

.app-header__new-menu-caption {
  color: var(--color-muted);
  font-size: 0.75rem;
}

.app-header__new-menu-item:hover {
  background: var(--color-accent-soft);
}

@media (width <=40rem) {
  .app-header__new {
    inline-size: 2.5rem;
    padding: 0;
    justify-content: center;
  }

  .app-header__new-label {
    display: none;
  }
}
</style>
