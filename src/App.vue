<template>
  <div class="app-shell">
    <AppUpdatePrompt />
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

import { onMounted } from 'vue';

import { useNotesStore } from '@/entities/note/model/note-store';
import { useDriveSyncStore } from '@/features/sync-drive/model/drive-sync-store';
import AppHeader from '@/widgets/app-header/ui/AppHeader.vue';
import AppUpdatePrompt from '@/features/pwa-update/ui/AppUpdatePrompt.vue';

const notesStore = useNotesStore();
const syncStore = useDriveSyncStore();

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
  void syncStore.syncOnStartup();
});
</script>
