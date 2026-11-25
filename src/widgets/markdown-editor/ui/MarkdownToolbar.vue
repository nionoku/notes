<template>
  <div
    class="editor-toolbar"
    role="toolbar"
    :aria-label="t('toolbar.formatting')"
  >
    <div
      class="editor-toolbar__group"
      role="group"
      :aria-label="t('toolbar.inlineGroup')"
    >
      <template v-for="button in inlineButtons" :key="button.action">
        <button
          type="button"
          class="editor-toolbar__button"
          :disabled="button.disabled"
          :aria-pressed="button.ariaPressed"
          :aria-label="t(button.labelKey)"
          :title="t(button.labelKey)"
          @mousedown.prevent
          @click="emit('action', button.action)"
        >
          <AppIcon :name="button.icon" :size="18" />
        </button>
      </template>
    </div>

    <span class="editor-toolbar__separator" aria-hidden="true"></span>

    <div
      class="editor-toolbar__group"
      role="group"
      :aria-label="t('toolbar.blocksGroup')"
    >
      <template v-for="button in blockButtons" :key="button.action">
        <button
          type="button"
          class="editor-toolbar__button"
          :aria-pressed="button.ariaPressed"
          :aria-label="t(button.labelKey)"
          :title="t(button.labelKey)"
          @mousedown.prevent
          @click="emit('action', button.action)"
        >
          <AppIcon :name="button.icon" :size="18" />
        </button>
      </template>
    </div>

    <span class="editor-toolbar__separator" aria-hidden="true"></span>

    <div
      class="editor-toolbar__group"
      role="group"
      :aria-label="t('toolbar.insertGroup')"
    >
      <template v-for="button in insertButtons" :key="button.action">
        <button
          type="button"
          class="editor-toolbar__button"
          :disabled="button.disabled"
          :aria-label="t(button.labelKey)"
          :title="t(button.labelKey)"
          @mousedown.prevent
          @click="emit('action', button.action)"
        >
          <AppIcon :name="button.icon" :size="18" />
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Панель инструментов markdown-редактора.
 */

import {computed} from 'vue';
import {useI18n} from 'vue-i18n';

import type {ToolbarAction} from '@/widgets/markdown-editor/model/toolbar-actions';
import AppIcon from '@/shared/ui/AppIcon.vue';

interface ToolbarButton {
  readonly action: ToolbarAction;
  readonly icon: string;
  readonly labelKey: string;
  readonly pressed?: boolean;
}

interface ToolbarButtonState extends ToolbarButton {
  readonly disabled: boolean;
  readonly ariaPressed: boolean | undefined;
}

const props = defineProps<{
  active: ReadonlySet<string>;
  allowImages: boolean;
}>();

const emit = defineEmits<{
  action: [action: ToolbarAction];
}>();
const {t} = useI18n();

const inlineBaseButtons: readonly ToolbarButton[] = [
  {action: 'bold', icon: 'bold', labelKey: 'toolbar.bold', pressed: true},
  {action: 'italic', icon: 'italic', labelKey: 'toolbar.italic', pressed: true},
  {
    action: 'underline',
    icon: 'underline',
    labelKey: 'toolbar.underline',
    pressed: true,
  },
  {
    action: 'strikethrough',
    icon: 'strikethrough',
    labelKey: 'toolbar.strikethrough',
    pressed: true,
  },
  {action: 'code', icon: 'code', labelKey: 'toolbar.code', pressed: true},
];

const blockBaseButtons: readonly ToolbarButton[] = [
  {
    action: 'code-block',
    icon: 'code-block',
    labelKey: 'toolbar.codeBlock',
    pressed: true,
  },
  {action: 'quote', icon: 'quote', labelKey: 'toolbar.quote', pressed: true},
  {
    action: 'unordered-list',
    icon: 'list',
    labelKey: 'toolbar.unorderedList',
    pressed: true,
  },
  {
    action: 'ordered-list',
    icon: 'ordered-list',
    labelKey: 'toolbar.orderedList',
    pressed: true,
  },
  {
    action: 'checkbox-list',
    icon: 'checkbox-list',
    labelKey: 'toolbar.taskList',
    pressed: true,
  },
  {
    action: 'horizontal-rule',
    icon: 'horizontal-rule',
    labelKey: 'toolbar.horizontalRule',
  },
];

const insertBaseButtons: readonly ToolbarButton[] = [
  {action: 'image', icon: 'image', labelKey: 'toolbar.image'},
  {action: 'link', icon: 'link', labelKey: 'toolbar.link'},
  {
    action: 'document-link',
    icon: 'document-link',
    labelKey: 'toolbar.documentLink',
  },
];

function withState(buttons: readonly ToolbarButton[]): ToolbarButtonState[] {
  return buttons.map(button => ({
    ...button,
    disabled: button.action === 'image' && !props.allowImages,
    ariaPressed: button.pressed ? props.active.has(button.action) : undefined,
  }));
}

const inlineButtons = computed(() => withState(inlineBaseButtons));
const blockButtons = computed(() => withState(blockBaseButtons));
const insertButtons = computed(() => withState(insertBaseButtons));
</script>

<style scoped>
.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem;
  border: 1px solid var(--color-border);
  border-block-end: 0;
  border-start-start-radius: 0.375rem;
  border-start-end-radius: 0.375rem;
  background: var(--color-surface);
}

.editor-toolbar__group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.1rem;
}

.editor-toolbar__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2rem;
  block-size: 2rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--color-text);
}

.editor-toolbar__button:hover {
  background: var(--color-accent-soft);
}

.editor-toolbar__button[aria-pressed='true'] {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.editor-toolbar__button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.editor-toolbar__separator {
  inline-size: 1px;
  block-size: 1.5rem;
  margin-inline: 0.2rem;
  background: var(--color-border);
}
</style>
