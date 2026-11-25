<template>
  <Teleport to="body">
    <dialog
      ref="dialogRef"
      class="image-lightbox"
      closedby="any"
      :aria-label="label"
      @close="emit('update:open', false)"
    >
      <button
        type="button"
        class="image-lightbox__close"
        :aria-label="t('common.close')"
        autofocus
        @click="close"
      >
        <AppIcon name="close" :size="22" />
      </button>
      <figure class="image-lightbox__figure">
        <template v-if="src">
          <img
            class="image-lightbox__image"
            :src="src"
            :alt="alt"
            decoding="async"
          />
        </template>
        <template v-if="alt">
          <figcaption class="image-lightbox__caption">
            {{ alt }}
          </figcaption>
        </template>
      </figure>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @fileoverview Просмотр изображения в модальном окне.
 */

import {computed, nextTick, onMounted, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';

import {useLightDismiss} from '@/shared/lib/light-dismiss';
import AppIcon from '@/shared/ui/AppIcon.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    src?: string;
    alt?: string;
  }>(),
  {
    src: '',
    alt: '',
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);
const {t} = useI18n();
const label = computed(() => props.alt || t('imageLightbox.label'));

useLightDismiss(dialogRef);

function close(): void {
  dialogRef.value?.close();
}

function syncOpenState(value: boolean): void {
  const dialog = dialogRef.value;
  if (!dialog) {
    return;
  }
  if (value && !dialog.open) {
    dialog.showModal();
  } else if (!value && dialog.open) {
    dialog.close();
  }
}

onMounted(() => {
  if (props.open) {
    void nextTick(() => syncOpenState(true));
  }
});

watch(
  () => props.open,
  value => {
    void nextTick(() => syncOpenState(value));
  },
);
</script>

<style scoped>
.image-lightbox {
  position: fixed;
  inset: 0;
  inline-size: 100%;
  block-size: 100dvh;
  max-inline-size: none;
  max-block-size: none;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  overflow: hidden;
  overscroll-behavior: contain;
  background: #0b0b0b;
  color: #f5f5f5;
}

.image-lightbox::backdrop {
  background: #000;
}

.image-lightbox__close {
  position: absolute;
  z-index: 1;
  inset-block-start: 1rem;
  inset-inline-end: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
}

.image-lightbox__close:hover {
  background: rgb(255 255 255 / 18%);
}

.image-lightbox__figure {
  position: relative;
  display: grid;
  place-items: center;
  inline-size: 100%;
  block-size: 100%;
  margin: 0;
  overflow: hidden;
}

.image-lightbox__image {
  display: block;
  inline-size: auto;
  block-size: auto;
  max-inline-size: 100%;
  max-block-size: 100dvh;
  object-fit: contain;
  border-radius: 0;
}

.image-lightbox__caption {
  position: absolute;
  inset-block-end: 1rem;
  inset-inline: 4rem;
  color: #f0f0f0;
  font-size: 0.8125rem;
  text-align: center;
  text-shadow: 0 1px 4px #000;
  pointer-events: none;
}
</style>
