<template>
  <div
    v-if="installAvailable"
    class="pwa-install"
  >
    <button
      type="button"
      class="button-link pwa-install__button"
      :aria-label="t('header.installApp')"
      :title="t('header.installApp')"
      @click="installApp"
    >
      <AppIcon
        name="install"
        :size="18"
      />
      <span>{{ t('header.install') }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Пункт меню установки PWA.
 */

import { useI18n } from 'vue-i18n';

import {
  installAvailable,
  promptPwaInstall,
} from '@/features/pwa-install/model/pwa-install-state';
import AppIcon from '@/shared/ui/AppIcon.vue';

const { t } = useI18n();

function installApp(): void {
  void promptPwaInstall();
}
</script>

<style scoped>
.pwa-install {
  margin-block-start: 0.35rem;
  padding-block-start: 0.35rem;
  border-block-start: 1px solid var(--color-border);
}

.pwa-install__button {
  display: flex;
  inline-size: 100%;
  min-block-size: 2.5rem;
  justify-content: flex-start;
  gap: 0.4rem;
  padding: 0.55rem 0.6rem;
  border: 0;
  border-radius: 0.25rem;
  background: none;
  color: var(--color-text);
  font: inherit;
  text-align: start;
}

.pwa-install__button:hover {
  background: var(--color-accent-soft);
}
</style>
