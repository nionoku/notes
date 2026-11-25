<template>
  <div class="app-shell">
    <AppHeader />
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Корневой компонент приложения.
 */

import {onMounted} from 'vue';

import {useNotesStore} from '@/entities/note/model/note-store';
import AppHeader from '@/widgets/app-header/ui/AppHeader.vue';

const notesStore = useNotesStore();

async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      await navigator.storage.persist();
    }
  } catch {
    // Постоянное хранилище — необязательное улучшение.
  }
}

onMounted(() => {
  void requestPersistence();
  void notesStore.loadAll();
});
</script>
