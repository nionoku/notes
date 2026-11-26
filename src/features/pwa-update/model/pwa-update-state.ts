/**
 * @fileoverview Состояние обновления PWA.
 */

import {ref} from 'vue';

export const updateAvailable = ref(false);
export const updating = ref(false);

let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null =
  null;

export function setUpdateServiceWorker(
  update: (reloadPage?: boolean) => Promise<void>,
): void {
  updateServiceWorker = update;
}

export async function applyPwaUpdate(): Promise<void> {
  const update = updateServiceWorker;
  if (!update || updating.value) {
    return;
  }

  updating.value = true;
  updateAvailable.value = false;
  try {
    await update(true);
  } catch {
    updateAvailable.value = true;
  } finally {
    updating.value = false;
  }
}
