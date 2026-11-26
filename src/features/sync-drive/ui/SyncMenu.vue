<template>
  <div class="sync-menu">
    <button
      type="button"
      class="button-link sync-menu__button"
      :popovertarget="menuId"
      :aria-label="moreLabel"
      :title="t('sync.menu.more')"
    >
      <AppIcon
        name="more"
        :size="18"
      />
      <span
        class="sync-menu__dot"
        :data-state="syncStore.state"
        aria-hidden="true"
      ></span>
    </button>

    <div
      :id="menuId"
      ref="menuRef"
      class="sync-menu__popover"
      popover="auto"
      :aria-label="t('sync.menu.aria')"
    >
      <div class="sync-menu__status">
        <span
          class="sync-menu__dot sync-menu__dot--large"
          :data-state="syncStore.state"
          aria-hidden="true"
        ></span>
        <div>
          <p class="sync-menu__status-title">
            {{ syncStore.statusLabel }}
          </p>
          <p class="sync-menu__status-detail">
            {{ syncStore.statusDetail }}
          </p>
        </div>
      </div>

      <button
        type="button"
        class="sync-menu__item"
        :disabled="syncDisabled"
        @click="syncNow"
      >
        {{ t('sync.menu.sync') }}
      </button>
      <button
        type="button"
        class="sync-menu__item"
        @click="openSettings"
      >
        {{ settingsLabel }}
      </button>

      <div class="sync-menu__separator"></div>
      <div
        class="sync-menu__slot"
        @click="hideMenu"
      >
        <slot />
      </div>
    </div>

    <SyncSettingsDialog v-model:open="settingsOpen" />
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Меню синхронизации в шапке приложения.
 */

import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';

import { useDriveSyncStore } from '@/features/sync-drive/model/drive-sync-store';
import SyncSettingsDialog from '@/features/sync-drive/ui/SyncSettingsDialog.vue';
import AppIcon from '@/shared/ui/AppIcon.vue';

const syncStore = useDriveSyncStore();
const { t } = useI18n();
const menuId = `app-menu-${useId()}`;
const menuRef = ref<HTMLElement | null>(null);
const settingsOpen = ref(false);
const canSync = computed(() => syncStore.configured && !syncStore.syncing);
const syncDisabled = computed(() => !canSync.value);
const settingsLabel = computed(() =>
  syncStore.configured ? t('sync.menu.settings') : t('sync.menu.connect'),
);
const moreLabel = computed(() =>
  t('sync.menu.moreWithStatus', { status: syncStore.statusLabel }),
);

function hideMenu(): void {
  menuRef.value?.hidePopover();
}

function syncNow(): void {
  hideMenu();
  void syncStore.sync();
}

function openSettings(): void {
  hideMenu();
  settingsOpen.value = true;
}
</script>

<style scoped>
.sync-menu {
  display: flex;
}

.sync-menu__button {
  position: relative;
  inline-size: 2.5rem;
  padding: 0;
  justify-content: center;
  anchor-name: --sync-menu-anchor;
}

.sync-menu__dot {
  position: absolute;
  inset-block-start: 0.55rem;
  inset-inline-end: 0.55rem;
  inline-size: 0.45rem;
  block-size: 0.45rem;
  border-radius: 50%;
  background: var(--color-muted);
}

.sync-menu__dot--large {
  position: static;
  flex: none;
  inline-size: 0.6rem;
  block-size: 0.6rem;
  margin-block-start: 0.35rem;
}

.sync-menu__dot[data-state='ready'] {
  background: var(--color-success);
}

.sync-menu__dot[data-state='syncing'] {
  background: var(--color-accent);
  animation: sync-pulse 1.2s ease-in-out infinite;
}

.sync-menu__dot[data-state='error'] {
  background: var(--color-danger);
}

.sync-menu__dot[data-state='offline'] {
  background: var(--color-muted);
}

.sync-menu__dot[data-state='not-configured'] {
  background: var(--color-muted);
  opacity: 0.55;
}

.sync-menu__popover {
  position: fixed;
  inset: auto;
  inset-block-start: 4.25rem;
  inset-inline-end: 1rem;
  inline-size: min(22rem, calc(100vw - 2rem));
  max-block-size: calc(100dvh - 5rem);
  margin: 0;
  padding: 0.6rem;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 12px 32px rgb(0 0 0 / 18%);
}

@supports (anchor-name: --sync-menu-anchor) {
  .sync-menu__popover {
    position-anchor: --sync-menu-anchor;
    inset-block-start: calc(anchor(--sync-menu-anchor bottom) + 0.35rem);
    inset-inline: anchor(--sync-menu-anchor right) auto;
    transform: translateX(-100%);
  }
}

.sync-menu__status {
  display: flex;
  gap: 0.5rem;
  padding: 0.35rem 0.4rem 0.5rem;
}

.sync-menu__status-title {
  font-weight: 600;
}

.sync-menu__status-detail {
  margin-block-start: 0.2rem;
  color: var(--color-muted);
  font-size: 0.75rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.sync-menu__item {
  display: block;
  inline-size: 100%;
  padding: 0.55rem 0.6rem;
  border: 0;
  border-radius: 0.25rem;
  background: none;
  color: var(--color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.sync-menu__item:hover {
  background: var(--color-accent-soft);
}

.sync-menu__item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sync-menu__separator {
  block-size: 1px;
  margin-block: 0.4rem;
  background: var(--color-border);
}

.sync-menu__slot :deep(.export-archive) {
  inline-size: 100%;
}

.sync-menu__slot :deep(.export-archive__button) {
  inline-size: 100%;
  padding: 0.55rem 0.6rem;
  border: 0;
  border-radius: 0.25rem;
  background: none;
  justify-content: flex-start;
  color: var(--color-text);
  font: inherit;
  text-align: start;
}

.sync-menu__slot :deep(.export-archive__button:hover) {
  background: var(--color-accent-soft);
}

@keyframes sync-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.35;
  }
}
</style>
