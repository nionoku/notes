import { translate } from '@/shared/i18n';

/**
 * @fileoverview SHA-256 для синхронизации файлов.
 */

export async function sha256Hex(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(translate('errors.hashUnsupported'));
  }
  const bytes =
    data instanceof Uint8Array ? Uint8Array.from(data) : new Uint8Array(data);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
