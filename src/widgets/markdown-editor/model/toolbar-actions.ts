/**
 * @fileoverview Действия панели инструментов редактора.
 */

import type {
  BlockFormat,
  InlineFormat,
} from '@/widgets/markdown-editor/model/editor-formatting';

export type TableAction =
  | 'table'
  | 'table-add-row'
  | 'table-add-column'
  | 'table-delete-row'
  | 'table-delete-column';

export type ToolbarAction =
  | InlineFormat
  | BlockFormat
  | TableAction
  | 'horizontal-rule'
  | 'link'
  | 'image'
  | 'document-link';
