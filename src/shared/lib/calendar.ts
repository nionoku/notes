/**
 * @fileoverview Формирование iCalendar-файла для события.
 */

export interface CalendarEventInput {
  readonly title: string;
  readonly start: Date;
  readonly end: Date;
  readonly url: string;
}

export interface CalendarEventFile {
  readonly content: string;
  readonly fileName: string;
}

function utcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  let result = '';
  let chunk = '';
  let bytes = 0;
  let limit = 75;

  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > limit) {
      result += `${chunk}\r\n `;
      chunk = '';
      bytes = 0;
      limit = 74;
    }
    chunk += character;
    bytes += size;
  }

  return result + chunk;
}

function safeFileName(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return `${safe || 'event'}.ics`;
}

export function buildCalendarEvent(
  input: CalendarEventInput,
): CalendarEventFile {
  const uid =
    typeof crypto.randomUUID === 'function'
      ? `${crypto.randomUUID()}@notes`
      : `${Date.now()}-${Math.random().toString(36).slice(2)}@notes`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Notes//Calendar event//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(input.start)}`,
    `DTEND:${utcStamp(input.end)}`,
    `SUMMARY:${escapeText(input.title)}`,
    `DESCRIPTION:${escapeText(input.url)}`,
    `URL:${input.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return {
    content: `${lines.map(foldLine).join('\r\n')}\r\n`,
    fileName: safeFileName(input.title),
  };
}
