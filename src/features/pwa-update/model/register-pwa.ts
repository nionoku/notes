/**
 * @fileoverview Регистрация service worker и проверка обновлений.
 */

import { registerSW } from 'virtual:pwa-register';

import {
  setUpdateServiceWorker,
  updateAvailable,
} from '@/features/pwa-update/model/pwa-update-state';

const UPDATE_INTERVAL_MS = 60 * 60 * 1_000;
let registered = false;

export function registerPwa(): void {
  if (registered || !import.meta.env.PROD) {
    return;
  }
  registered = true;

  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateAvailable.value = true;
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return;
      }
      window.setInterval(() => {
        void registration.update();
      }, UPDATE_INTERVAL_MS);
    },
  });
  setUpdateServiceWorker(updateServiceWorker);
}
