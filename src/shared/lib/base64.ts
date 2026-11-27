/**
 * @fileoverview Base64 для бинарных данных синхронизации.
 */

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** URL-safe base64 без padding — для значения query-параметра. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Принимает и base64url, и обычный base64 (включая потерянные `+`). */
export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value
    .trim()
    .replace(/\s+/g, '+')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return base64ToBytes(`${normalized}${'='.repeat(padding)}`);
}
