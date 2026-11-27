<template>
  <section
    class="note-page"
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

    <template v-else-if="note">
      <article class="note">
        <header class="note__header">
          <div class="note__title-row">
            <div class="note__title-group">
              <template v-if="note.imported">
                <ImportedMark />
              </template>
              <h1 :id="headingId">
                {{ note.title }}
              </h1>
            </div>
            <div class="note__actions">
              <RouterLink
                class="button-link note__action note__edit"
                :to="editUrl"
                :aria-label="t('common.edit')"
                :title="t('common.edit')"
              >
                <AppIcon
                  name="edit"
                  :size="18"
                />
                <span class="note__action-label">{{ t('common.edit') }}</span>
              </RouterLink>
              <button
                type="button"
                class="button-link note__actions-button"
                :popovertarget="actionsMenuId"
                aria-haspopup="menu"
                :aria-label="t('noteView.moreActions')"
                :title="t('noteView.moreActions')"
              >
                <AppIcon
                  name="more"
                  :size="18"
                />
              </button>
              <div
                :id="actionsMenuId"
                ref="actionsMenuRef"
                class="note__actions-menu"
                popover="auto"
                role="menu"
                :aria-label="t('noteView.actions')"
              >
                <button
                  type="button"
                  class="note__menu-item"
                  role="menuitem"
                  :disabled="archiving"
                  @click="archiveFromMenu"
                >
                  <AppIcon
                    name="archive"
                    :size="16"
                  />
                  {{ archiveActionLabel }}
                </button>
                <button
                  type="button"
                  class="note__menu-item"
                  role="menuitem"
                  :disabled="exporting"
                  @click="exportFromMenu"
                >
                  <AppIcon
                    name="download"
                    :size="16"
                  />
                  {{ t('noteView.export') }}
                </button>
                <template v-if="isArchived">
                  <button
                    type="button"
                    class="note__menu-item note__menu-item--danger"
                    role="menuitem"
                    :disabled="deleting"
                    @click="deleteFromMenu"
                  >
                    <AppIcon
                      name="trash"
                      :size="16"
                    />
                    {{ t('noteView.delete') }}
                  </button>
                </template>
              </div>
            </div>
          </div>
          <template v-if="hasDates">
            <p class="note__date">
              <NoteDates
                :created-at="note.createdAt"
                :modified-at="note.modifiedAt"
              />
            </p>
          </template>
          <NoteTags :tags="note.tags" />
          <template v-if="hasDue">
            <div class="note__due">
              <span
                class="note__due-info"
                :class="dueInfoClass"
              >
                <AppIcon
                  name="clock"
                  :size="14"
                />

                <time :datetime="note.dueAt">{{ dueTime }}</time>
              </span>
              <button
                type="button"
                class="button-link note__calendar"
                @click="createCalendarEvent"
              >
                <AppIcon
                  name="calendar"
                  :size="16"
                />
                {{ t('noteView.calendar') }}
              </button>
            </div>
          </template>
        </header>

        <NoteContentView
          :note="note"
          :anchor="anchor"
          @toggle-task="handleToggleTask"
        />
      </article>
      <AppDialog
        v-model:open="deleteDialogOpen"
        :title="t('noteView.deleteTitle')"
      >
        <p class="hint">
          {{ t('noteView.deleteText') }}
        </p>
        <div class="form-actions">
          <button
            type="button"
            :disabled="deleting"
            @click="closeDeleteDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="button-link note__danger-button"
            :disabled="deleting"
            @click="deleteCurrentNote"
          >
            {{ t('noteView.deleteConfirm') }}
          </button>
        </div>
      </AppDialog>
    </template>

    <template v-else-if="showMissing">
      <div class="note-page__missing">
        <h1>{{ t('common.documentNotFound') }}</h1>
        <p>{{ t('common.documentMissing') }}</p>
        <RouterLink
          class="button-link"
          :to="listUrl"
          replace
        >
          {{ t('common.backToNotes') }}
        </RouterLink>
      </div>
    </template>
    <Teleport to="body">
      <div
        class="note-status-region"
        role="region"
        :aria-label="t('status.notifications')"
      >
        <template v-if="statusMessage">
          <div
            ref="statusRef"
            class="note-status-toast"
            :class="toastClass"
            popover="manual"
            @focusin="handleStatusFocusIn"
            @focusout="handleStatusFocusOut"
          >
            <span>{{ statusMessage }}</span>
            <button
              type="button"
              class="note-status-toast__close"
              :aria-label="t('common.close')"
              @click="hideStatus(true)"
            >
              <AppIcon
                name="close"
                :size="14"
              />
            </button>
          </div>
        </template>
      </div>
      <div
        class="visually-hidden"
        :aria-live="statusLive"
        aria-atomic="true"
      >
        {{ statusAnnouncement }}
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
/**
 * @fileoverview Просмотр документа.
 */

import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';

import { formatDateTime } from '@/shared/lib/date';
import { buildCalendarEvent } from '@/shared/lib/calendar';
import { downloadBlob } from '@/shared/lib/download';
import { useRoute, useRouter } from 'vue-router';

import { useNotesStore, describeError } from '@/entities/note/model/note-store';
import { useDriveSyncStore } from '@/features/sync-drive/model/drive-sync-store';
import { exportNoteArchive } from '@/features/export-note/model/export-note';
import NoteDates from '@/entities/note/ui/NoteDates.vue';
import NoteTags from '@/entities/note/ui/NoteTags.vue';
import NoteContentView from '@/widgets/note-content/ui/NoteContentView.vue';
import AppIcon from '@/shared/ui/AppIcon.vue';
import AppDialog from '@/shared/ui/AppDialog.vue';
import ImportedMark from '@/shared/ui/ImportedMark.vue';
import {
  documentUrl,
  editDocumentRoute,
  notesListRoute,
} from '@/shared/lib/urls';

const props = defineProps<{
  path: string;
}>();

const notesStore = useNotesStore();
const syncStore = useDriveSyncStore();
const route = useRoute();
const router = useRouter();
const headingId = useId();
const { t } = useI18n();
const statusMessage = ref('');
const statusFailed = ref(false);
const statusAnnouncement = ref('');
const statusRef = ref<HTMLElement | null>(null);
const actionsMenuRef = ref<HTMLElement | null>(null);
const actionsMenuId = `note-actions-${useId()}`;
const exporting = ref(false);
const deleting = ref(false);
const deleteDialogOpen = ref(false);
const archiving = ref(false);
let statusTimer: number | undefined;
let lastFocused: HTMLElement | null = null;

function scheduleStatusHide(): void {
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(
    () => {
      hideStatus();
    },
    statusFailed.value ? 8_000 : 4_000,
  );
}

function showStatus(message: string, failed = false): void {
  window.clearTimeout(statusTimer);
  statusMessage.value = message;
  statusFailed.value = failed;
  statusAnnouncement.value = '';
  lastFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  void nextTick(() => {
    statusAnnouncement.value = message;
    const toast = statusRef.value;
    if (toast && !toast.matches(':popover-open')) {
      toast.showPopover();
    }
    scheduleStatusHide();
  });
}

function hideStatus(restoreFocus = false): void {
  window.clearTimeout(statusTimer);
  const toast = statusRef.value;
  if (toast?.matches(':popover-open')) {
    toast.hidePopover();
  }
  statusMessage.value = '';
  statusAnnouncement.value = '';
  if (restoreFocus) {
    lastFocused?.focus();
  }
}

function handleStatusFocusIn(): void {
  window.clearTimeout(statusTimer);
}

function handleStatusFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && statusRef.value?.contains(next)) {
    return;
  }
  scheduleStatusHide();
}

const note = computed(() => notesStore.getByPath(props.path));
const isArchived = computed(() => note.value?.state === 'archived');
const archiveActionLabel = computed(() =>
  isArchived.value ? t('noteView.unarchive') : t('noteView.archive'),
);

async function exportNote(): Promise<void> {
  const current = note.value;
  if (!current || exporting.value) {
    return;
  }

  exporting.value = true;
  try {
    await exportNoteArchive(current);
    showStatus(t('noteView.exportDone'));
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : t('noteView.exportError'),
      true,
    );
  } finally {
    exporting.value = false;
  }
}

async function toggleArchive(): Promise<void> {
  const current = note.value;
  if (!current || archiving.value) {
    return;
  }

  const archived = !isArchived.value;
  archiving.value = true;
  try {
    await notesStore.setArchived(current, archived);
    showStatus(t(archived ? 'noteView.archived' : 'noteView.unarchived'));
  } catch (error) {
    showStatus(describeError(error), true);
  } finally {
    archiving.value = false;
  }
}

function hideNoteActionsMenu(): void {
  actionsMenuRef.value?.hidePopover();
}

function archiveFromMenu(): void {
  hideNoteActionsMenu();
  void toggleArchive();
}

function exportFromMenu(): void {
  hideNoteActionsMenu();
  void exportNote();
}

function deleteFromMenu(): void {
  hideNoteActionsMenu();
  openDeleteDialog();
}

function openDeleteDialog(): void {
  if (!isArchived.value || deleting.value) {
    return;
  }
  deleteDialogOpen.value = true;
}

function closeDeleteDialog(): void {
  if (!deleting.value) {
    deleteDialogOpen.value = false;
  }
}

async function deleteCurrentNote(): Promise<void> {
  const current = note.value;
  if (!current || deleting.value) {
    return;
  }

  deleting.value = true;
  try {
    await syncStore.deleteRemote(current);
    await notesStore.remove(current);
    deleteDialogOpen.value = false;
    await router.replace(listUrl);
  } catch (error) {
    showStatus(describeError(error), true);
  } finally {
    deleting.value = false;
  }
}

const anchor = computed(() => route.hash);
const editUrl = computed(() =>
  note.value ? editDocumentRoute(note.value.path) : '',
);
const dueOverdue = computed(() => {
  if (!note.value?.dueAt) {
    return false;
  }
  const time = Date.parse(note.value.dueAt);
  return Number.isFinite(time) && time < Date.now();
});
const showError = computed(() => notesStore.status === 'error');
const showMissing = computed(
  () => notesStore.status === 'ready' && !note.value,
);
const hasDates = computed(() =>
  Boolean(note.value?.createdAt || note.value?.modifiedAt),
);
const hasDue = computed(() => Boolean(note.value?.dueAt));
const dueInfoClass = computed(() => ({
  'note__due-info--overdue': dueOverdue.value,
}));
const dueTime = computed(() =>
  note.value?.dueAt ? formatDateTime(note.value.dueAt) : '',
);
const toastClass = computed(() => ({
  'note-status-toast--error': statusFailed.value,
}));
const statusLive = computed(() =>
  statusFailed.value ? 'assertive' : 'polite',
);
const listUrl = notesListRoute();
function createCalendarEvent(): void {
  const current = note.value;
  if (!current?.dueAt) {
    return;
  }
  const start = new Date(current.dueAt);
  if (Number.isNaN(start.getTime())) {
    return;
  }
  const end = new Date(start.getTime() + 60 * 60 * 1_000);
  const url = `${window.location.origin}${documentUrl(current.path)}`;
  const event = buildCalendarEvent({
    title: current.title,
    start,
    end,
    url,
  });
  downloadBlob(
    new Blob([event.content], { type: 'text/calendar;charset=utf-8' }),
    event.fileName,
  );
  showStatus(t('noteView.calendarDownloaded'));
}

async function handleToggleTask(
  taskIndex: number,
  checked: boolean,
): Promise<void> {
  const current = note.value;
  if (!current) {
    return;
  }

  try {
    await notesStore.toggleTask(current, taskIndex, checked);
    syncStore.requestTaskSync();
  } catch (error) {
    showStatus(describeError(error), true);
  }
}

function retry(): void {
  void notesStore.loadAll(true);
}

onBeforeUnmount(() => {
  window.clearTimeout(statusTimer);
  hideStatus();
});
</script>

<style scoped>
.note__header {
  display: grid;
  gap: 0.5rem;
  padding-block: 0 2rem;
  border-block-end: 1px solid var(--color-border);
}

.note__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.note__title-group {
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: 0.5rem;
  min-inline-size: 0;
}

.note__title-group h1 {
  flex: 1;
  min-inline-size: 0;
  font-size: clamp(1.75rem, 5vw, 2.5rem);
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.note__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.5rem;
}

.note__action {
  flex: none;
}

.note__edit {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-surface);
}

.note__edit:hover {
  color: var(--color-surface);
  filter: brightness(0.95);
}

.note__actions-button {
  inline-size: 2.5rem;
  padding: 0;
  justify-content: center;
  anchor-name: --note-actions-anchor;
}

.note__actions-menu {
  position: fixed;
  inset: auto;
  inset-block-start: 4.25rem;
  inset-inline-end: 1rem;
  inline-size: 14rem;
  margin: 0;
  padding: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 12px 32px rgb(0 0 0 / 18%);
}

.note__actions-menu:popover-open {
  display: grid;
  gap: 0.1rem;
}

@supports (anchor-name: --note-actions-anchor) {
  .note__actions-menu {
    position-anchor: --note-actions-anchor;
    inset-block-start: calc(anchor(--note-actions-anchor bottom) + 0.35rem);
    inset-inline: anchor(--note-actions-anchor right) auto;
    transform: translateX(-100%);
  }
}

.note__menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

.note__menu-item:hover {
  background: var(--color-accent-soft);
}

.note__menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.note__menu-item--danger {
  color: var(--color-danger);
}

.note__date {
  margin: 0;
}

.note__due {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
}

.note__due-info {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-success);
  font-size: 0.875rem;
}

.note__due-info--overdue {
  color: var(--color-warning);
}

.note__danger-button {
  color: var(--color-danger);
}

.note__calendar {
  font-size: 0.8125rem;
}

.note__action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.note-status-toast {
  position: fixed;
  inset: auto;
  inset-block-end: 1rem;
  inset-inline-end: 1rem;
  max-inline-size: min(22rem, calc(100% - 2rem));
  margin: 0;
  padding: 0.55rem 0.55rem 0.55rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  box-shadow: 0 8px 24px rgb(0 0 0 / 15%);
  color: var(--color-text);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.note-status-toast:popover-open {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.note-status-toast--error {
  color: var(--color-danger);
}

.note-status-toast__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  inline-size: 1.5rem;
  block-size: 1.5rem;
  padding: 0;
  border: 0;
  border-radius: 0.2rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.note-status-toast__close:hover {
  background: var(--color-accent-soft);
}

@media (width <=40rem) {
  .note__action {
    inline-size: 2.5rem;
    padding: 0;
    justify-content: center;
  }

  .note__action-label {
    display: none;
  }
}

.note-page__missing {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  padding-block: 2rem;
}
</style>
