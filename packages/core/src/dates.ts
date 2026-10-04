/**
 * Tage im Plan als Zeichenkette `JJJJ-MM-TT` (lokales Datum). Gerechnet wird in UTC,
 * damit Sommer- und Winterzeit keine Tage verschieben.
 */

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toUtc(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function fromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value;
}

/** Heutiges Datum in der Zeitzone des Geräts. */
export function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(key: string, days: number): string {
  const date = toUtc(key);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** Wochentag: 0 = Montag … 6 = Sonntag. */
export function weekday(key: string): number {
  return (toUtc(key).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: string): string {
  return addDays(key, -weekday(key));
}

/** Aufeinanderfolgende Tage ab `start`. */
export function dayRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

export function dayOfMonth(key: string): number {
  return toUtc(key).getUTCDate();
}

/** z. B. „Mo, 6. Okt.“ */
export function formatDate(key: string): string {
  const date = toUtc(key);
  return `${WEEKDAYS[weekday(key)]}, ${date.getUTCDate()}. ${MONTHS[date.getUTCMonth()]}`;
}

/** z. B. „Mo 6.10.“ */
export function formatShortDate(key: string): string {
  const date = toUtc(key);
  return `${WEEKDAYS[weekday(key)]} ${date.getUTCDate()}.${date.getUTCMonth() + 1}.`;
}

export function weekdayLabel(index: number): string {
  return WEEKDAYS[index] ?? '';
}

/** „Heute“, „Morgen“, „Gestern“ oder das Datum. */
export function formatRelativeDate(key: string, today: string): string {
  if (key === today) return 'Heute';
  if (key === addDays(today, 1)) return 'Morgen';
  if (key === addDays(today, -1)) return 'Gestern';
  return formatDate(key);
}
