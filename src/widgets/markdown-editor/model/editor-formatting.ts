/**
 * @fileoverview Модель markdown-редактора: форматирование и поведение Enter.
 *
 * Все функции чистые: получают значение textarea и выделение, возвращают новое
 * значение и новое выделение.
 */

export type InlineFormat =
  'bold' | 'italic' | 'underline' | 'strikethrough' | 'code';

export type BlockFormat =
  | 'heading-2'
  | 'heading-3'
  | 'quote'
  | 'unordered-list'
  | 'ordered-list'
  | 'checkbox-list'
  | 'code-block';

export interface EditorSelection {
  readonly start: number;
  readonly end: number;
}

export interface EditResult {
  readonly value: string;
  readonly selection: EditorSelection;
}

interface InlineMarkers {
  readonly open: string;
  readonly close: string;
}

const INLINE_MARKERS: Readonly<Record<InlineFormat, InlineMarkers>> = {
  bold: { open: '**', close: '**' },
  italic: { open: '*', close: '*' },
  underline: { open: '<u>', close: '</u>' },
  strikethrough: { open: '~~', close: '~~' },
  code: { open: '`', close: '`' },
};

const CHECKBOX_PATTERN = /^(\s*)[-*+]\s+\[[ xX]\]\s*/;
const LIST_PATTERN = /^(\s*)(?:[-*+]|\d+[.)])\s+/;
const UNORDERED_PATTERN = /^(\s*)[-*+]\s+(?!\[[ xX]\])/;
const ORDERED_PATTERN = /^(\s*)\d+[.)]\s+/;
const QUOTE_PATTERN = /^(\s*)>\s?/;
const HEADING_2_PATTERN = /^(\s*)##(?!#)\s+/;
const HEADING_3_PATTERN = /^(\s*)###(?!#)\s+/;
const TASK_MARKER_PATTERN = /^(\s*)[-*+]\s+\[[ xX]\]\s*/;

function clampSelection(
  value: string,
  selection: EditorSelection,
): EditorSelection {
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));
  return { start, end };
}

function lineStart(value: string, index: number): number {
  return value.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
}

function lineEnd(value: string, index: number): number {
  const found = value.indexOf('\n', index);
  return found === -1 ? value.length : found;
}

function lineText(value: string, index: number): string {
  return value.slice(lineStart(value, index), lineEnd(value, index));
}

function blockRange(
  value: string,
  selection: EditorSelection,
): EditorSelection {
  const { start, end } = clampSelection(value, selection);
  const startLine = lineStart(value, start);
  const endIndex = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const endLine = lineEnd(value, endIndex);
  return { start: startLine, end: endLine };
}

function isEscaped(value: string, index: number): boolean {
  let backslashes = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && value[cursor] === '\\';
    cursor -= 1
  ) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function countMarker(value: string, marker: string): number {
  let count = 0;
  let cursor = 0;
  while (cursor < value.length) {
    const found = value.indexOf(marker, cursor);
    if (found === -1) {
      break;
    }
    if (!isEscaped(value, found)) {
      if (marker === '*' && value[found + 1] === '*') {
        cursor = found + 2;
        continue;
      }
      count += 1;
    }
    cursor = found + marker.length;
  }
  return count;
}

/** Находится ли позиция между парными маркерами на текущей строке. */
function isInsidePair(
  value: string,
  index: number,
  marker: InlineMarkers,
): boolean {
  const currentLine = lineText(value, index);
  const offset = index - lineStart(value, index);

  if (marker.open === marker.close) {
    const before = countMarker(currentLine.slice(0, offset), marker.open);
    const after = countMarker(currentLine.slice(offset), marker.close);
    return before % 2 === 1 && after > 0;
  }

  const before = currentLine.lastIndexOf(marker.open, offset - 1);
  if (before === -1) {
    return false;
  }
  const closeBefore = currentLine.lastIndexOf(marker.close, offset - 1);
  if (closeBefore > before) {
    return false;
  }
  return currentLine.indexOf(marker.close, offset) !== -1;
}

export function isInsideFencedCode(value: string, index: number): boolean {
  return findFenceBlock(value, index) !== null;
}

function isInlineActive(
  value: string,
  selection: EditorSelection,
  format: InlineFormat,
): boolean {
  if (format === 'code' && isInsideFencedCode(value, selection.start)) {
    return false;
  }

  const markers = INLINE_MARKERS[format];
  const { start, end } = clampSelection(value, selection);
  const openLength = markers.open.length;
  const closeLength = markers.close.length;

  const wrappedOutside =
    value.slice(start - openLength, start) === markers.open &&
    value.slice(end, end + closeLength) === markers.close;
  if (wrappedOutside) {
    return true;
  }

  const selected = value.slice(start, end);
  if (
    selected.length >= openLength + closeLength &&
    selected.startsWith(markers.open) &&
    selected.endsWith(markers.close)
  ) {
    return true;
  }

  if (start === end) {
    return isInsidePair(value, start, markers);
  }

  return (
    isInsidePair(value, start, markers) && isInsidePair(value, end, markers)
  );
}

function removeEnclosingMarkers(
  value: string,
  selection: EditorSelection,
  markers: InlineMarkers,
): EditResult | null {
  const { start, end } = selection;
  const openLength = markers.open.length;
  const closeLength = markers.close.length;

  if (
    value.slice(start - openLength, start) === markers.open &&
    value.slice(end, end + closeLength) === markers.close
  ) {
    return {
      value:
        value.slice(0, start - openLength) +
        value.slice(start, end) +
        value.slice(end + closeLength),
      selection: {
        start: start - openLength,
        end: end - openLength,
      },
    };
  }

  const selected = value.slice(start, end);
  if (
    selected.length >= openLength + closeLength &&
    selected.startsWith(markers.open) &&
    selected.endsWith(markers.close)
  ) {
    return {
      value:
        value.slice(0, start) +
        selected.slice(openLength, selected.length - closeLength) +
        value.slice(end),
      selection: {
        start,
        end: end - openLength - closeLength,
      },
    };
  }

  if (start !== end) {
    const lineBegin = lineStart(value, start);
    const lineEndIndex = lineEnd(value, end);
    const before = value.slice(lineBegin, start);
    const after = value.slice(end, lineEndIndex);

    if (markers.open === markers.close) {
      if (countMarker(before, markers.open) % 2 === 0) {
        return null;
      }
      const openIndex = before.lastIndexOf(markers.open);
      const closeIndex = after.indexOf(markers.close);
      if (openIndex === -1 || closeIndex === -1) {
        return null;
      }

      const absoluteOpen = lineBegin + openIndex;
      const absoluteClose = end + closeIndex;
      return {
        value:
          value.slice(0, absoluteOpen) +
          value.slice(absoluteOpen + openLength, absoluteClose) +
          value.slice(absoluteClose + closeLength),
        selection: {
          start: start - openLength,
          end: end - openLength,
        },
      };
    }

    const openIndex = before.lastIndexOf(markers.open);
    if (openIndex === -1) {
      return null;
    }
    if (before.lastIndexOf(markers.close) > openIndex) {
      return null;
    }
    const closeIndex = after.indexOf(markers.close);
    if (closeIndex === -1) {
      return null;
    }

    const absoluteOpen = lineBegin + openIndex;
    const absoluteClose = end + closeIndex;
    return {
      value:
        value.slice(0, absoluteOpen) +
        value.slice(absoluteOpen + openLength, absoluteClose) +
        value.slice(absoluteClose + closeLength),
      selection: {
        start: start - openLength,
        end: end - openLength,
      },
    };
  }

  if (markers.open === markers.close) {
    const lineBegin = lineStart(value, start);
    const currentLine = value.slice(lineBegin, lineEnd(value, start));
    const offset = start - lineBegin;
    const before = currentLine.slice(0, offset);
    const after = currentLine.slice(offset);
    if (countMarker(before, markers.open) % 2 === 0) {
      return null;
    }

    const openIndex = before.lastIndexOf(markers.open);
    if (openIndex === -1) {
      return null;
    }
    const closeIndex = after.indexOf(markers.close);
    if (closeIndex === -1) {
      return null;
    }

    const absoluteOpen = lineBegin + openIndex;
    const absoluteClose = lineBegin + offset + closeIndex;
    return {
      value:
        value.slice(0, absoluteOpen) +
        value.slice(absoluteOpen + openLength, absoluteClose) +
        value.slice(absoluteClose + closeLength),
      selection: {
        start: start - openLength,
        end: start - openLength,
      },
    };
  }

  const lineBegin = lineStart(value, start);
  const currentLine = value.slice(lineBegin, lineEnd(value, start));
  const offset = start - lineBegin;
  const openIndex = currentLine.lastIndexOf(markers.open, offset - 1);
  if (openIndex === -1) {
    return null;
  }
  if (currentLine.lastIndexOf(markers.close, offset - 1) > openIndex) {
    return null;
  }
  const closeIndex = currentLine.indexOf(markers.close, offset);
  if (closeIndex === -1) {
    return null;
  }

  const absoluteOpen = lineBegin + openIndex;
  const absoluteClose = lineBegin + closeIndex;
  return {
    value:
      value.slice(0, absoluteOpen) +
      value.slice(absoluteOpen + openLength, absoluteClose) +
      value.slice(absoluteClose + closeLength),
    selection: {
      start: start - openLength,
      end: start - openLength,
    },
  };
}

export function isFormatActive(
  value: string,
  selection: EditorSelection,
  format: InlineFormat | BlockFormat,
): boolean {
  if (format in INLINE_MARKERS) {
    return isInlineActive(
      value,
      clampSelection(value, selection),
      format as InlineFormat,
    );
  }
  return isBlockActive(value, selection, format as BlockFormat);
}

export function toggleInlineFormat(
  value: string,
  selection: EditorSelection,
  format: InlineFormat,
): EditResult {
  const safeSelection = clampSelection(value, selection);
  const markers = INLINE_MARKERS[format];

  if (isInlineActive(value, safeSelection, format)) {
    const removed = removeEnclosingMarkers(value, safeSelection, markers);
    if (removed) {
      return removed;
    }
  }

  if (safeSelection.start === safeSelection.end) {
    const insert = `${markers.open}${markers.close}`;
    return {
      value:
        value.slice(0, safeSelection.start) +
        insert +
        value.slice(safeSelection.end),
      selection: {
        start: safeSelection.start + markers.open.length,
        end: safeSelection.start + markers.open.length,
      },
    };
  }

  const selected = value.slice(safeSelection.start, safeSelection.end);
  return {
    value:
      value.slice(0, safeSelection.start) +
      markers.open +
      selected +
      markers.close +
      value.slice(safeSelection.end),
    selection: {
      start: safeSelection.start + markers.open.length,
      end: safeSelection.end + markers.open.length,
    },
  };
}

function findFenceBlock(
  value: string,
  index: number,
): {
  readonly openStart: number;
  readonly closeStart: number;
  readonly closeEnd: number;
} | null {
  let open: { readonly start: number; readonly marker: string } | null = null;
  let offset = 0;

  for (const line of value.split('\n')) {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (match) {
      const marker = (match[1] ?? '')[0] ?? '`';
      if (open === null) {
        open = { start: offset, marker };
      } else if (open.marker === marker) {
        const blockEnd = offset + line.length;
        if (index >= open.start && index <= blockEnd) {
          return {
            openStart: open.start,
            closeStart: offset,
            closeEnd: blockEnd,
          };
        }
        open = null;
      }
    }
    offset += line.length + 1;
  }

  if (open !== null && index >= open.start) {
    return {
      openStart: open.start,
      closeStart: value.length,
      closeEnd: value.length,
    };
  }

  return null;
}

function isHorizontalRule(line: string): boolean {
  return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function isBlockActive(
  value: string,
  selection: EditorSelection,
  format: BlockFormat,
): boolean {
  const { start, end } = clampSelection(value, selection);
  if (format === 'code-block') {
    return isInsideFencedCode(value, start);
  }
  if (start === end) {
    const block = blockRange(value, selection);
    const line = value.slice(block.start, block.end);
    return lineMatchesFormat(line, format);
  }

  const block = blockRange(value, selection);
  const lines = value.slice(block.start, block.end).split('\n');
  const nonEmpty = lines.filter(line => line.trim() !== '');
  return (
    nonEmpty.length > 0 &&
    nonEmpty.every(line => lineMatchesFormat(line, format))
  );
}

function lineMatchesFormat(line: string, format: BlockFormat): boolean {
  switch (format) {
    case 'heading-2':
      return HEADING_2_PATTERN.test(line);
    case 'heading-3':
      return HEADING_3_PATTERN.test(line);
    case 'quote':
      return QUOTE_PATTERN.test(line);
    case 'unordered-list':
      return UNORDERED_PATTERN.test(line);
    case 'ordered-list':
      return ORDERED_PATTERN.test(line);
    case 'checkbox-list':
      return TASK_MARKER_PATTERN.test(line);
    case 'code-block':
      return false;
    default:
      return false;
  }
}

function stripListMarkers(line: string): string {
  const checkbox = CHECKBOX_PATTERN.exec(line);
  if (checkbox) {
    return `${checkbox[1] ?? ''}${line.slice(checkbox[0].length)}`;
  }
  const list = LIST_PATTERN.exec(line);
  if (list) {
    return `${list[1] ?? ''}${line.slice(list[0].length)}`;
  }
  return line;
}

function addMarkerToLine(
  line: string,
  format: BlockFormat,
  index: number,
): string {
  switch (format) {
    case 'heading-2':
    case 'heading-3': {
      const marker = format === 'heading-2' ? '##' : '###';
      const match = /^(\s*)/.exec(line);
      const indent = match?.[1] ?? '';
      const content = line.slice(indent.length).replace(/^#{1,6}\s+/, '');
      return `${indent}${marker} ${content}`;
    }
    case 'quote': {
      const match = /^(\s*)/.exec(line);
      const indent = match?.[1] ?? '';
      return `${indent}> ${line.slice(indent.length)}`;
    }
    case 'unordered-list': {
      const cleaned = stripListMarkers(line);
      const match = /^(\s*)/.exec(cleaned);
      const indent = match?.[1] ?? '';
      return `${indent}- ${cleaned.slice(indent.length)}`;
    }
    case 'ordered-list': {
      const cleaned = stripListMarkers(line);
      const match = /^(\s*)/.exec(cleaned);
      const indent = match?.[1] ?? '';
      return `${indent}${index + 1}. ${cleaned.slice(indent.length)}`;
    }
    case 'checkbox-list': {
      const cleaned = stripListMarkers(line);
      const match = /^(\s*)/.exec(cleaned);
      const indent = match?.[1] ?? '';
      return `${indent}- [ ] ${cleaned.slice(indent.length)}`;
    }
    case 'code-block':
      return line;
    default:
      return line;
  }
}

function removeMarkerFromLine(line: string, format: BlockFormat): string {
  switch (format) {
    case 'heading-2':
    case 'heading-3':
      return line.replace(/^(\s*)#{1,6}\s+/, '$1');
    case 'quote': {
      const match = QUOTE_PATTERN.exec(line);
      return match ? `${match[1] ?? ''}${line.slice(match[0].length)}` : line;
    }
    case 'unordered-list':
    case 'ordered-list':
    case 'checkbox-list': {
      const checkbox = CHECKBOX_PATTERN.exec(line);
      if (checkbox) {
        return `${checkbox[1] ?? ''}${line.slice(checkbox[0].length)}`;
      }
      const list = LIST_PATTERN.exec(line);
      if (list) {
        return `${list[1] ?? ''}${line.slice(list[0].length)}`;
      }
      return line;
    }
    case 'code-block':
      return line;
    default:
      return line;
  }
}

function removeFenceBlock(
  value: string,
  block: {
    readonly openStart: number;
    readonly closeStart: number;
    readonly closeEnd: number;
  },
): EditResult {
  const withoutClose =
    value.slice(0, block.closeStart) + value.slice(block.closeEnd + 1);
  const openLineEnd = value.indexOf('\n', block.openStart);
  const finalValue =
    openLineEnd === -1
      ? withoutClose
      : withoutClose.slice(0, block.openStart) +
        withoutClose.slice(openLineEnd + 1);

  return {
    value: finalValue,
    selection: { start: block.openStart, end: block.openStart },
  };
}

export function toggleBlockFormat(
  value: string,
  selection: EditorSelection,
  format: BlockFormat,
): EditResult {
  const safeSelection = clampSelection(value, selection);
  const block = blockRange(value, safeSelection);

  if (format === 'code-block') {
    const fence = findFenceBlock(value, safeSelection.start);
    if (fence) {
      return removeFenceBlock(value, fence);
    }

    const content = value.slice(block.start, block.end);
    const before = value.slice(0, block.start);
    const after = value.slice(block.end);
    const wrapped = `\`\`\`\n${content}\n\`\`\``;
    const suffix =
      after === '' || after.startsWith('\n') ? after : `\n${after}`;
    return {
      value: `${before}${wrapped}${suffix}`,
      selection: {
        start: block.start + 4,
        end: block.start + 4 + content.length,
      },
    };
  }

  const lines = value.slice(block.start, block.end).split('\n');
  const nonEmpty = lines.filter(line => line.trim() !== '');
  const active =
    nonEmpty.length > 0 &&
    nonEmpty.every(line => lineMatchesFormat(line, format));

  const isSingleEmptyLine =
    safeSelection.start === safeSelection.end &&
    lines.length === 1 &&
    (lines[0] ?? '').trim() === '';

  let listIndex = 0;
  const transformed = lines.map(line => {
    if (line.trim() === '') {
      return isSingleEmptyLine && !active
        ? addMarkerToLine(line, format, listIndex)
        : line;
    }
    if (active) {
      return removeMarkerFromLine(line, format);
    }
    if (lineMatchesFormat(line, format)) {
      return line;
    }
    const next = addMarkerToLine(line, format, listIndex);
    listIndex += 1;
    return next;
  });

  const prefix = value.slice(0, block.start);
  const suffix = value.slice(block.end);
  const replacement = transformed.join('\n');
  const collapsed = safeSelection.start === safeSelection.end;

  return {
    value: `${prefix}${replacement}${suffix}`,
    selection: collapsed
      ? {
          start: prefix.length + (transformed[0]?.length ?? 0),
          end: prefix.length + (transformed[0]?.length ?? 0),
        }
      : { start: prefix.length, end: prefix.length + replacement.length },
  };
}

interface ListMarker {
  readonly indent: string;
  readonly marker: string;
  readonly task: boolean;
}

function parseListMarker(line: string): ListMarker | null {
  const match = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/.exec(line);
  if (!match) {
    return null;
  }
  return {
    indent: match[1] ?? '',
    marker: match[2] ?? '-',
    task: Boolean(match[3]),
  };
}

function nextOrderedMarker(marker: string): string {
  const match = /^(\d+)([.)])$/.exec(marker);
  if (!match) {
    return '1.';
  }
  return `${Number(match[1]) + 1}${match[2]}`;
}

const LIST_INDENT = '  ';
const LIST_MARKER_PATTERN = /^(\s*)([-*+]|\d+[.)])([ \t]+)/;

function markerContentStart(line: string): number | null {
  const match = LIST_MARKER_PATTERN.exec(line);
  return match ? match[0].length : null;
}

function previousNonEmptyLine(value: string, offset: number): string | null {
  const lines = value.slice(0, offset).split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (line.trim() !== '') {
      return line;
    }
  }
  return null;
}

function listIndentIncrement(
  value: string,
  block: EditorSelection,
  lines: readonly string[],
): number {
  const firstLine = lines.find(line => line.trim() !== '') ?? '';
  const currentIndent = /^[ \t]*/.exec(firstLine)?.[0].length ?? 0;
  const previous = previousNonEmptyLine(value, block.start);
  if (!previous) {
    return LIST_INDENT.length;
  }

  const parent = LIST_MARKER_PATTERN.exec(previous);
  if (!parent) {
    return LIST_INDENT.length;
  }

  const needed = parent[0].length - currentIndent;
  return needed > 0 ? needed : LIST_INDENT.length;
}

function mapListCaret(
  originalLine: string,
  transformedLine: string,
  column: number,
): number {
  const originalStart = markerContentStart(originalLine);
  const transformedStart = markerContentStart(transformedLine);
  if (originalStart === null || transformedStart === null) {
    return column;
  }
  if (column >= originalStart) {
    return column - originalStart + transformedStart;
  }
  return Math.min(column, transformedStart);
}

function listLines(
  value: string,
  selection: EditorSelection,
): {
  readonly block: EditorSelection;
  readonly lines: readonly string[];
} | null {
  const safeSelection = clampSelection(value, selection);
  const block = blockRange(value, safeSelection);
  const lines = value.slice(block.start, block.end).split('\n');
  const contentLines = lines.filter(line => line.trim() !== '');

  if (contentLines.length === 0) {
    return null;
  }
  if (!contentLines.every(line => LIST_PATTERN.test(line))) {
    return null;
  }

  return { block, lines };
}

function outdentAmount(value: string, lineStart: number, line: string): number {
  const indent = /^[ \t]*/.exec(line)?.[0].length ?? 0;
  if (indent === 0) {
    return 0;
  }

  const previousLines = value.slice(0, lineStart).split('\n');
  let targetIndent = 0;
  for (let index = previousLines.length - 1; index >= 0; index -= 1) {
    const previousLine = previousLines[index] ?? '';
    if (previousLine.trim() === '') {
      continue;
    }
    const previousIndent = /^[ \t]*/.exec(previousLine)?.[0].length ?? 0;
    if (previousIndent < indent) {
      targetIndent = previousIndent;
      break;
    }
  }
  return indent - targetIndent;
}

export function indentListSelection(
  value: string,
  selection: EditorSelection,
): EditResult | null {
  const result = listLines(value, selection);
  if (!result) {
    return null;
  }

  const { block, lines } = result;
  if (
    lines.some(line => line.trim() !== '' && TASK_MARKER_PATTERN.test(line))
  ) {
    return null;
  }

  const increment = listIndentIncrement(value, block, lines);
  let orderedIndex = 1;
  const transformed = lines.map(line => {
    if (line.trim() === '') {
      return line;
    }

    const indented = `${' '.repeat(increment)}${line}`;
    const marker = LIST_MARKER_PATTERN.exec(indented);
    if (!marker || !/^\d+[.)]$/.test(marker[2] ?? '')) {
      return indented;
    }

    const nextLine =
      `${marker[1] ?? ''}${orderedIndex}${(marker[2] ?? '').slice(-1)}` +
      `${marker[3] ?? ''}${indented.slice(marker[0].length)}`;
    orderedIndex += 1;
    return nextLine;
  });
  const replacement = transformed.join('\n');
  if (replacement === value.slice(block.start, block.end)) {
    return null;
  }

  const safeSelection = clampSelection(value, selection);
  if (safeSelection.start !== safeSelection.end) {
    return {
      value: value.slice(0, block.start) + replacement + value.slice(block.end),
      selection: {
        start: block.start,
        end: block.start + replacement.length,
      },
    };
  }

  const beforeCaret = value.slice(block.start, safeSelection.start);
  const caretLine = beforeCaret.split('\n').length - 1;
  const lineStart = block.start + beforeCaret.lastIndexOf('\n') + 1;
  const column = safeSelection.start - lineStart;
  const nextColumn = mapListCaret(
    lines[caretLine] ?? '',
    transformed[caretLine] ?? '',
    column,
  );

  return {
    value: value.slice(0, block.start) + replacement + value.slice(block.end),
    selection: {
      start: lineStart + nextColumn,
      end: lineStart + nextColumn,
    },
  };
}

export function outdentListSelection(
  value: string,
  selection: EditorSelection,
): EditResult | null {
  const result = listLines(value, selection);
  if (!result) {
    return null;
  }

  const { block, lines } = result;
  let offset = block.start;
  const lineStarts = lines.map(line => {
    const start = offset;
    offset += line.length + 1;
    return start;
  });
  const amounts = lines.map((line, index) =>
    line.trim() === ''
      ? 0
      : outdentAmount(value, lineStarts[index] ?? block.start, line),
  );
  if (!amounts.some(amount => amount > 0)) {
    return null;
  }

  const transformed = lines.map((line, index) => {
    const amount = amounts[index] ?? 0;
    return line.trim() === '' ? line : line.slice(amount);
  });
  const replacement = transformed.join('\n');
  if (replacement === value.slice(block.start, block.end)) {
    return null;
  }

  const safeSelection = clampSelection(value, selection);
  if (safeSelection.start !== safeSelection.end) {
    return {
      value: value.slice(0, block.start) + replacement + value.slice(block.end),
      selection: {
        start: block.start,
        end: block.start + replacement.length,
      },
    };
  }

  const beforeCaret = value.slice(block.start, safeSelection.start);
  const caretLine = beforeCaret.split('\n').length - 1;
  const lineStart = block.start + beforeCaret.lastIndexOf('\n') + 1;
  const column = safeSelection.start - lineStart;
  const nextColumn = mapListCaret(
    lines[caretLine] ?? '',
    transformed[caretLine] ?? '',
    column,
  );

  return {
    value: value.slice(0, block.start) + replacement + value.slice(block.end),
    selection: {
      start: lineStart + nextColumn,
      end: lineStart + nextColumn,
    },
  };
}

/**
 * Обрабатывает Enter: продолжает список, цитату или блок кода, а на пустом
 * пункте удаляет маркер.
 */
export function continueMarkdown(
  value: string,
  caret: number,
): EditResult | null {
  const position = Math.max(0, Math.min(caret, value.length));
  const start = lineStart(value, position);
  const end = lineEnd(value, position);
  const line = value.slice(start, end);
  const beforeCaret = line.slice(0, position - start);
  const afterCaret = line.slice(position - start);

  const fence = findFenceBlock(value, position);
  if (fence) {
    if (line.trim() === '' && position === end) {
      const insert = '```\n';
      return {
        value: value.slice(0, position) + insert + value.slice(position),
        selection: {
          start: position + insert.length,
          end: position + insert.length,
        },
      };
    }
    return null;
  }

  if (isHorizontalRule(line)) {
    return null;
  }

  const quote = /^(\s*)>\s?/.exec(line);
  const list = parseListMarker(line);
  if (!quote && !list) {
    return null;
  }

  const markerLength = quote
    ? quote[0].length
    : list
      ? list.indent.length + list.marker.length + 1 + (list.task ? 4 : 0)
      : 0;
  const content = line.slice(markerLength);

  if (content.trim() === '' && position >= start + markerLength) {
    return {
      value: value.slice(0, start) + '\n' + value.slice(end),
      selection: { start: start + 1, end: start + 1 },
    };
  }

  let continuation: string;
  if (quote && (!list || position < start + quote[0].length)) {
    continuation = `${quote[1] ?? ''}> `;
  } else if (list) {
    const listMarker = list.task
      ? `${list.indent}- [ ] `
      : list.marker.match(/^\d/) && !list.task
        ? `${list.indent}${nextOrderedMarker(list.marker)} `
        : `${list.indent}${list.marker} `;
    continuation = listMarker;
  } else {
    continuation = '';
  }

  const insert = `\n${continuation}${afterCaret}`;
  return {
    value: value.slice(0, start) + beforeCaret + insert + value.slice(end),
    selection: {
      start: start + beforeCaret.length + 1 + continuation.length,
      end: start + beforeCaret.length + 1 + continuation.length,
    },
  };
}

/** Добавляет горизонтальную линию отдельным блоком. */
export function insertHorizontalRule(value: string, caret: number): EditResult {
  const position = Math.max(0, Math.min(caret, value.length));
  const line = lineText(value, position);
  const needsLeadingBreak = line.trim() !== '';
  const before = needsLeadingBreak ? '\n\n' : '';
  const after = value.slice(position).startsWith('\n') ? '\n' : '\n\n';
  const insert = `${before}---${after}`;
  return {
    value: value.slice(0, position) + insert + value.slice(position),
    selection: {
      start: position + insert.length,
      end: position + insert.length,
    },
  };
}

/* -------------------------------- Таблицы -------------------------------- */

/** Состояние курсора внутри markdown-таблицы. */
export interface TableContext {
  /** Строка: 0 — заголовок, 1 — разделитель, 2 и далее — данные. */
  readonly rowIndex: number;
  /** Столбец, в котором стоит курсор. */
  readonly columnIndex: number;
  readonly columnCount: number;
  readonly canDeleteRow: boolean;
  readonly canDeleteColumn: boolean;
}

interface TableCell {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface TableRow {
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly cells: readonly TableCell[];
}

interface SourceLine {
  readonly start: number;
  readonly end: number;
}

interface TableBlock {
  readonly rows: readonly TableRow[];
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly columnCount: number;
}

type TableEdit = (value: string, caret: number) => EditResult | null;

/** Операция над таблицей; `null` означает, что применять её некуда. */
export type TableOperation = TableEdit;

const TABLE_DELIMITER_CELL = /^\s*:?-+:?\s*$/;
const TABLE_COLUMN_COUNT = 3;
const TABLE_BODY_ROW_COUNT = 2;

function sourceLines(value: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let offset = 0;
  for (const text of value.split('\n')) {
    lines.push({ start: offset, end: offset + text.length });
    offset += text.length + 1;
  }
  return lines;
}

function lineIndexAt(lines: readonly SourceLine[], index: number): number {
  for (let line = 0; line < lines.length; line += 1) {
    if (index <= (lines[line]?.end ?? 0)) {
      return line;
    }
  }
  return Math.max(0, lines.length - 1);
}

/** Делит строку на ячейки по неэкранированным `|`, сохраняя смещения. */
function splitTableRow(
  value: string,
  lineStart: number,
  lineEnd: number,
): TableCell[] | null {
  const pipes: number[] = [];
  for (let index = lineStart; index < lineEnd; index += 1) {
    if (value[index] === '|' && !isEscaped(value, index)) {
      pipes.push(index);
    }
  }
  if (pipes.length === 0) {
    return null;
  }

  const cells: TableCell[] = [];
  let cellStart = lineStart;
  for (const pipe of pipes) {
    cells.push({
      start: cellStart,
      end: pipe,
      text: value.slice(cellStart, pipe),
    });
    cellStart = pipe + 1;
  }
  cells.push({
    start: cellStart,
    end: lineEnd,
    text: value.slice(cellStart, lineEnd),
  });

  const first = cells[0];
  if (cells.length > 1 && first && first.text.trim() === '') {
    cells.shift();
  }
  const last = cells[cells.length - 1];
  if (cells.length > 1 && last && last.text.trim() === '') {
    cells.pop();
  }
  return cells;
}

function tableRowAt(value: string, line: SourceLine): TableRow | null {
  const cells = splitTableRow(value, line.start, line.end);
  if (!cells || cells.length === 0) {
    return null;
  }
  return { lineStart: line.start, lineEnd: line.end, cells };
}

function tableRowAtLine(
  value: string,
  lines: readonly SourceLine[],
  index: number,
): TableRow | null {
  const line = lines[index];
  return line ? tableRowAt(value, line) : null;
}

function isDelimiterRow(row: TableRow): boolean {
  return row.cells.every(cell => TABLE_DELIMITER_CELL.test(cell.text));
}

function cellColumnAt(row: TableRow, index: number): number {
  for (let column = 0; column < row.cells.length; column += 1) {
    if (index <= (row.cells[column]?.end ?? 0)) {
      return column;
    }
  }
  return Math.max(0, row.cells.length - 1);
}

/** Находит таблицу вокруг позиции курсора и текущую строку и столбец. */
function findTableBlock(value: string, position: number): TableBlock | null {
  const index = Math.max(0, Math.min(position, value.length));
  if (isInsideFencedCode(value, index)) {
    return null;
  }

  const lines = sourceLines(value);
  const caretLine = lineIndexAt(lines, index);
  if (!tableRowAtLine(value, lines, caretLine)) {
    return null;
  }

  let firstLine = caretLine;
  while (firstLine > 0 && tableRowAtLine(value, lines, firstLine - 1)) {
    firstLine -= 1;
  }
  let lastLine = caretLine;
  while (
    lastLine + 1 < lines.length &&
    tableRowAtLine(value, lines, lastLine + 1)
  ) {
    lastLine += 1;
  }

  let headerLine = -1;
  for (let line = firstLine + 1; line <= lastLine; line += 1) {
    const delimiter = tableRowAtLine(value, lines, line);
    const header = tableRowAtLine(value, lines, line - 1);
    if (
      delimiter &&
      header &&
      isDelimiterRow(delimiter) &&
      header.cells.length === delimiter.cells.length
    ) {
      headerLine = line - 1;
      break;
    }
  }
  if (headerLine === -1) {
    return null;
  }

  const rows: TableRow[] = [];
  for (let line = headerLine; line < lines.length; line += 1) {
    const row = tableRowAtLine(value, lines, line);
    if (!row) {
      break;
    }
    rows.push(row);
  }

  const rowIndex = caretLine - headerLine;
  if (rows.length < 2 || rowIndex < 0 || rowIndex >= rows.length) {
    return null;
  }

  const header = rows[0];
  const currentRow = rows[rowIndex];
  if (!header || !currentRow) {
    return null;
  }

  return {
    rows,
    rowIndex,
    columnIndex: Math.min(
      cellColumnAt(currentRow, index),
      Math.max(0, header.cells.length - 1),
    ),
    columnCount: header.cells.length,
  };
}

function renderTableRow(cells: readonly string[]): string {
  const content = cells.map(cell => cell.trim()).join(' | ');
  return `| ${content} |`;
}

function tableRowCells(row: TableRow, minimum: number): string[] {
  const cells = row.cells.map(cell => cell.text.trim());
  while (cells.length < minimum) {
    cells.push('');
  }
  return cells;
}

/** Смещение начала содержимого ячейки внутри отрендеренной строки. */
function cellContentOffset(line: string, column: number): number {
  const cells = splitTableRow(line, 0, line.length);
  if (!cells || cells.length === 0) {
    return 0;
  }
  const cell = cells[Math.min(column, cells.length - 1)];
  return (cell?.start ?? 0) + 1;
}

function replaceTableRows(
  value: string,
  table: TableBlock,
  rows: readonly string[],
  targetRow: number,
  targetColumn: number,
): EditResult {
  const blockStart = table.rows[0]?.lineStart ?? 0;
  const blockEnd = table.rows[table.rows.length - 1]?.lineEnd ?? value.length;
  let caret = blockStart;
  for (let row = 0; row < targetRow; row += 1) {
    caret += (rows[row]?.length ?? 0) + 1;
  }
  caret += cellContentOffset(rows[targetRow] ?? '', targetColumn);
  return {
    value: value.slice(0, blockStart) + rows.join('\n') + value.slice(blockEnd),
    selection: { start: caret, end: caret },
  };
}

/** Состояние таблицы в позиции курсора или `null`, если курсор вне таблицы. */
export function tableContextAt(
  value: string,
  index: number,
): TableContext | null {
  const table = findTableBlock(value, index);
  if (!table) {
    return null;
  }
  return {
    rowIndex: table.rowIndex,
    columnIndex: table.columnIndex,
    columnCount: table.columnCount,
    canDeleteRow: table.rowIndex >= 2,
    canDeleteColumn: table.columnCount > 1,
  };
}

/**
 * Вставляет таблицу из трёх столбцов: заголовок и две строки.
 * Внутри существующей таблицы новая добавляется под ней.
 */
export function insertTable(value: string, caret: number): EditResult {
  const position = Math.max(0, Math.min(caret, value.length));
  const header = renderTableRow(
    Array.from({ length: TABLE_COLUMN_COUNT }, () => ''),
  );
  const delimiter = renderTableRow(
    Array.from({ length: TABLE_COLUMN_COUNT }, () => '---'),
  );
  const tableRows = [header, delimiter];
  for (let row = 0; row < TABLE_BODY_ROW_COUNT; row += 1) {
    tableRows.push(header);
  }
  const tableText = tableRows.join('\n');
  const columnOffset = cellContentOffset(header, 0);

  const anchor = findTableBlock(value, position);
  if (anchor) {
    const insertAt =
      anchor.rows[anchor.rows.length - 1]?.lineEnd ?? value.length;
    const after = value.slice(insertAt);
    const trailing =
      after === ''
        ? '\n'
        : after.startsWith('\n\n')
          ? ''
          : after.startsWith('\n')
            ? '\n'
            : '\n\n';
    const insert = `\n\n${tableText}${trailing}`;
    return {
      value: value.slice(0, insertAt) + insert + value.slice(insertAt),
      selection: {
        start: insertAt + 2 + columnOffset,
        end: insertAt + 2 + columnOffset,
      },
    };
  }

  const before = value.slice(0, position);
  const after = value.slice(position);
  const leading =
    before === ''
      ? ''
      : before.endsWith('\n\n')
        ? ''
        : before.endsWith('\n')
          ? '\n'
          : '\n\n';
  const trailing =
    after === ''
      ? '\n'
      : after.startsWith('\n\n')
        ? ''
        : after.startsWith('\n')
          ? '\n'
          : '\n\n';
  const insert = `${leading}${tableText}${trailing}`;
  const nextCaret = position + leading.length + columnOffset;
  return {
    value: value.slice(0, position) + insert + value.slice(position),
    selection: { start: nextCaret, end: nextCaret },
  };
}

/** Удаляет строку данных, в которой стоит курсор. */
export function deleteTableRow(
  value: string,
  caret: number,
): EditResult | null {
  const table = findTableBlock(value, caret);
  if (!table || table.rowIndex < 2) {
    return null;
  }

  const row = table.rows[table.rowIndex];
  if (!row) {
    return null;
  }
  const hasLineBreak = row.lineEnd < value.length;
  const removeStart = hasLineBreak
    ? row.lineStart
    : Math.max(0, row.lineStart - 1);
  const removeEnd = hasLineBreak ? row.lineEnd + 1 : row.lineEnd;
  const shift = removeStart - removeEnd;
  const caretOffset = Math.max(0, caret - row.lineStart);
  const target =
    table.rows[table.rowIndex + 1] ?? table.rows[table.rowIndex - 1];

  let selectionStart = removeStart;
  if (target) {
    const followsRemovedRow = table.rows[table.rowIndex + 1] === target;
    const targetStart = followsRemovedRow
      ? target.lineStart + shift
      : target.lineStart;
    const targetEnd = followsRemovedRow
      ? target.lineEnd + shift
      : target.lineEnd;
    selectionStart = Math.min(targetStart + caretOffset, targetEnd);
  }

  return {
    value: value.slice(0, removeStart) + value.slice(removeEnd),
    selection: { start: selectionStart, end: selectionStart },
  };
}

/** Удаляет столбец, в котором стоит курсор. */
export function deleteTableColumn(
  value: string,
  caret: number,
): EditResult | null {
  const table = findTableBlock(value, caret);
  if (!table || table.columnCount < 2) {
    return null;
  }

  const rows = table.rows.map(row => {
    const cells = tableRowCells(row, table.columnCount);
    cells.splice(table.columnIndex, 1);
    return renderTableRow(cells);
  });
  const targetColumn = Math.min(table.columnIndex, table.columnCount - 2);
  return replaceTableRows(value, table, rows, table.rowIndex, targetColumn);
}

/** Добавляет пустой столбец справа от столбца с курсором. */
export function addTableColumnRight(
  value: string,
  caret: number,
): EditResult | null {
  const table = findTableBlock(value, caret);
  if (!table) {
    return null;
  }

  const targetColumn = table.columnIndex + 1;
  const rows = table.rows.map((row, rowIndex) => {
    const cells = tableRowCells(row, table.columnCount);
    cells.splice(targetColumn, 0, rowIndex === 1 ? '---' : '');
    return renderTableRow(cells);
  });
  return replaceTableRows(value, table, rows, table.rowIndex, targetColumn);
}

/** Добавляет пустую строку под строкой с курсором. Заголовок не трогает. */
export function addTableRowBelow(
  value: string,
  caret: number,
): EditResult | null {
  const table = findTableBlock(value, caret);
  if (!table || table.rowIndex === 0) {
    return null;
  }

  const anchor = table.rows[table.rowIndex];
  if (!anchor) {
    return null;
  }
  const row = renderTableRow(
    Array.from({ length: table.columnCount }, () => ''),
  );
  const insertAt = anchor.lineEnd;
  const columnOffset = cellContentOffset(row, table.columnIndex);
  return {
    value: value.slice(0, insertAt) + '\n' + row + value.slice(insertAt),
    selection: {
      start: insertAt + 1 + columnOffset,
      end: insertAt + 1 + columnOffset,
    },
  };
}
