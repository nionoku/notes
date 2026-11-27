/**
 * @fileoverview Состояние установки PWA и вызов системного prompt.
 */

import { ref } from 'vue';

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{
    readonly outcome: 'accepted' | 'dismissed';
    readonly platform: string;
  }>;
  prompt(): Promise<void>;
}

export const installAvailable = ref(false);

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;

function isStandalone(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean })
    .standalone;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    standalone === true
  );
}

function handleBeforeInstallPrompt(event: Event): void {
  const promptEvent = event as BeforeInstallPromptEvent;
  promptEvent.preventDefault();
  if (isStandalone()) {
    return;
  }
  deferredPrompt = promptEvent;
  installAvailable.value = true;
}

function handleAppInstalled(): void {
  deferredPrompt = null;
  installAvailable.value = false;
}

export function initPwaInstall(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  if (isStandalone()) {
    return;
  }
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
}

export async function promptPwaInstall(): Promise<void> {
  const prompt = deferredPrompt;
  if (!prompt) {
    return;
  }

  deferredPrompt = null;
  installAvailable.value = false;
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch {
    // Пользователь отменил или браузер не дал показать окно.
  }
}
