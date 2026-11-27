/**
 * @fileoverview Генерация web app manifest для vite-plugin-pwa.
 */

import type { ManifestOptions } from 'vite-plugin-pwa';

type LocalizedText = Record<string, string>;
type Shortcut = NonNullable<ManifestOptions['shortcuts']>[number];

interface LocalizedManifest extends Partial<ManifestOptions> {
  name_localized?: LocalizedText;
  short_name_localized?: LocalizedText;
  description_localized?: LocalizedText;
  shortcuts_localized?: Record<string, Shortcut[]>;
}

export function createManifest(base: string): LocalizedManifest {
  const shortcutIcon = {
    src: 'pwa-192x192.png',
    sizes: '192x192',
    type: 'image/png',
  };

  const newNoteShortcut: Shortcut = {
    name: 'New note',
    short_name: 'New note',
    description: 'Create a new note',
    url: `${base}create`,
    icons: [shortcutIcon],
  };

  return {
    id: base,
    name: 'Notes',
    short_name: 'Notes',
    description: 'A local Markdown knowledge base.',
    lang: 'en',
    dir: 'ltr',
    // Chrome/Edge 148+ resolve *_localized fields; other browsers use the base values.
    description_localized: {
      ru: 'Локальная база знаний в формате Markdown.',
    },
    start_url: base,
    scope: base,
    display: 'standalone',
    background_color: '#f8f9fa',
    theme_color: '#f8f9fa',
    icons: [
      {
        src: 'pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: 'pwa-monochrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'monochrome',
      },
      {
        src: 'pwa-monochrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'monochrome',
      },
    ],
    shortcuts: [newNoteShortcut],
    shortcuts_localized: {
      ru: [
        {
          ...newNoteShortcut,
          name: 'Новая заметка',
          short_name: 'Новая заметка',
          description: 'Создать новую заметку',
        },
      ],
    },
    screenshots: [
      {
        src: 'screenshots/notes-wide.png',
        sizes: '1280x720',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Notes list',
      },
      {
        src: 'screenshots/notes-narrow.png',
        sizes: '720x1280',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Markdown note',
      },
    ],
  };
}
