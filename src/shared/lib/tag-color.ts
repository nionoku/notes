/**
 * @fileoverview Детерминированный цвет тега.
 *
 * Оттенок выбирается из нейтральной палитры по хэшу текста тега, поэтому не
 * меняется после перезагрузки страницы. Насыщенность и светлота задаются в
 * CSS, чтобы поддерживать светлую и тёмную темы.
 */

const TAG_HUES = [
  20, 45, 75, 105, 135, 165, 195, 220, 250, 280, 315, 345,
] as const;

function hashTag(tag: string): number {
  let hash = 2_166_136_261;
  for (const character of tag.normalize('NFC')) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function tagHue(tag: string): number {
  return TAG_HUES[hashTag(tag) % TAG_HUES.length] ?? 20;
}
