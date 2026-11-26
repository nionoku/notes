<template>
  <template v-if="updateAvailable">
    <section class="app-update" role="status" aria-live="polite">
      <div class="app-update__inner">
        <p class="app-update__message">
          <strong>{{ t('pwa.updateTitle') }}</strong>
          {{ t('pwa.updateText') }}
        </p>
        <button
          type="button"
          class="button-link app-update__action"
          :disabled="updating"
          @click="reloadApp"
        >
          {{ t('pwa.updateAction') }}
        </button>
      </div>
    </section>
  </template>
</template>

<script setup lang="ts">
/**
 * @fileoverview Уведомление о доступном обновлении PWA.
 */

import {useI18n} from 'vue-i18n';

import {
  applyPwaUpdate,
  updateAvailable,
  updating,
} from '@/features/pwa-update/model/pwa-update-state';

const {t} = useI18n();

function reloadApp(): void {
  void applyPwaUpdate();
}
</script>

<style scoped>
.app-update {
  position: sticky;
  inset-block-start: 0;
  z-index: 20;
  padding-block: 0.65rem;
  border-block-end: 1px solid var(--color-border);
  background: var(--color-accent-soft);
  color: var(--color-text);
}

.app-update__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  inline-size: min(100% - 2rem, var(--content-width));
  margin-inline: auto;
}

.app-update__message {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
}

.app-update__message strong {
  margin-inline-end: 0.3rem;
}

.app-update__action {
  flex: none;
}

@media (width <=40rem) {
  .app-update__action {
    inline-size: 100%;
    justify-content: center;
  }
}
</style>
