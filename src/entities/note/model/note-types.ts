/**
 * @fileoverview Типы сущности «документ».
 */

export type NoteState = 'active' | 'archived';

export interface Note {
  /** Публичный путь документа (для URL и ссылок), без расширения `.md`. */
  readonly path: string;
  /** Путь markdown-файла без расширения: `<путь>/<заголовок>.md`. */
  readonly filePath: string;
  /** Путь директории документа относительно корня. */
  readonly dirPath: string;
  readonly title: string;
  /** ISO-дата создания; пустая строка — дата неизвестна. */
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Дата изменения, если документ менялся после создания. */
  readonly modifiedAt: string;
  /** Срок выполнения; пустая строка — срок не задан. */
  readonly dueAt: string;
  /** Состояние документа: обычный или архивный. */
  readonly state: NoteState;
  /** Документ был импортирован и ещё не изменялся в приложении. */
  readonly imported: boolean;
  /** SHA-256 содержимого markdown-файла. */
  readonly hash: string;
  readonly tags: readonly string[];
  /** Тело документа без служебного frontmatter и без H1-заголовка. */
  readonly body: string;
  /** Дополнительные поля frontmatter, которые нужно сохранить. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

export interface NoteDraft {
  readonly title: string;
  readonly tags: readonly string[];
  readonly body: string;
  readonly dueAt?: string;
  readonly state?: NoteState;
}

export interface PendingAsset {
  readonly fileName: string;
  readonly file: File;
}
