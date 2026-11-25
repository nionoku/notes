<template>
  <template v-if="hasAny">
    <span class="note-dates">
      <template v-if="createdAt">
        <time :datetime="createdAt">
          <span class="visually-hidden">{{ t('dates.created') }}</span>{{
            createdLabel
          }}
        </time>
      </template>
      <template v-if="hasBoth">
        <span aria-hidden="true">{{ t('dates.separator') }}</span>
      </template>
      <template v-if="modifiedAt">
        <time :datetime="modifiedAt">
          <span class="visually-hidden">{{ t('dates.modified') }}</span>{{
            modifiedLabel
          }}
        </time>
      </template>
    </span>
  </template>
</template>

<script setup lang="ts">
/**
 * @fileoverview Дата создания и дата изменения документа.
 */

import {computed} from 'vue';
import {useI18n} from 'vue-i18n';

import {formatDate} from '@/shared/lib/date';

const props = defineProps<{
  createdAt: string;
  modifiedAt: string;
}>();

const {t} = useI18n();
const hasAny = computed(() => Boolean(props.createdAt || props.modifiedAt));
const hasBoth = computed(() => Boolean(props.createdAt && props.modifiedAt));
const createdLabel = computed(() => formatDate(props.createdAt));
const modifiedLabel = computed(() => formatDate(props.modifiedAt));
</script>

<style scoped>
.note-dates {
  color: var(--color-muted);
  font-size: 0.875rem;
}
</style>
