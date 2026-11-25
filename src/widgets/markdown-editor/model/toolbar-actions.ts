/**
 * @fileoverview Действия панели инструментов редактора.
 */

import type {
  BlockFormat,
  InlineFormat,
} from '@/widgets/markdown-editor/model/editor-formatting';

export type ToolbarAction =
  | InlineFormat
  | BlockFormat
  | 'horizontal-rule'
  | 'link'
  | 'image'
  | 'document-link';
