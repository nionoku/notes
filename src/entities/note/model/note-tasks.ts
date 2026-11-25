/**
 * @fileoverview Изменение состояния checkbox-задач в markdown.
 */

const TASK_LINE_PATTERN = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;

export interface TaskLine {
  readonly lineIndex: number;
  readonly checked: boolean;
  readonly text: string;
}

export function findTaskLines(body: string): TaskLine[] {
  const tasks: TaskLine[] = [];
  const lines = body.split('\n');
  let fence: string | null = null;

  lines.forEach((line, lineIndex) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = (fenceMatch[1] ?? '')[0] ?? '`';
      if (fence === null) {
        fence = marker;
      } else if (fence === marker) {
        fence = null;
      }
      return;
    }
    if (fence !== null) {
      return;
    }

    const match = TASK_LINE_PATTERN.exec(line);
    if (!match) {
      return;
    }
    tasks.push({
      lineIndex,
      checked: (match[2] ?? ' ').toLowerCase() === 'x',
      text: line.slice(match[0].length).trim(),
    });
  });

  return tasks;
}

/**
 * Переключает checkbox по его порядковому номеру среди задач документа.
 */
export function toggleTaskAt(
  body: string,
  taskIndex: number,
  checked: boolean,
): string {
  const lines = body.split('\n');
  let currentIndex = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const match = TASK_LINE_PATTERN.exec(line);
    if (!match) {
      continue;
    }

    if (currentIndex === taskIndex) {
      const marker = checked ? 'x' : ' ';
      lines[lineIndex] =
        `${match[1] ?? ''}${marker}${match[3] ?? ''}` +
        line.slice(match[0].length);
      return lines.join('\n');
    }

    currentIndex += 1;
  }

  return body;
}
