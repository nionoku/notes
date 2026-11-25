/**
 * @fileoverview Светлое закрытие модальных окон по клику на подложку.
 *
 * Атрибут `closedby` поддерживается не всеми браузерами. Для них повторяем
 * штатное поведение: закрываем диалог, если нажатие и отпускание указателя
 * произошли вне прямоугольника диалога.
 */

import {onBeforeUnmount, onMounted, type Ref} from 'vue';

function isOutside(dialog: HTMLDialogElement, event: PointerEvent): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

export function useLightDismiss(
  dialogRef: Ref<HTMLDialogElement | null>,
): void {
  let pressedOutside = false;

  const handlePointerDown = (event: PointerEvent) => {
    const dialog = dialogRef.value;
    if (!dialog) {
      return;
    }
    pressedOutside = isOutside(dialog, event);
  };

  const handlePointerUp = (event: PointerEvent) => {
    const dialog = dialogRef.value;
    if (!dialog) {
      return;
    }
    if (pressedOutside && isOutside(dialog, event)) {
      dialog.close();
    }
    pressedOutside = false;
  };

  onMounted(() => {
    if ('closedBy' in HTMLDialogElement.prototype) {
      return;
    }
    const dialog = dialogRef.value;
    if (!dialog) {
      return;
    }
    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
  });

  onBeforeUnmount(() => {
    const dialog = dialogRef.value;
    if (!dialog) {
      return;
    }
    dialog.removeEventListener('pointerdown', handlePointerDown);
    dialog.removeEventListener('pointerup', handlePointerUp);
  });
}
