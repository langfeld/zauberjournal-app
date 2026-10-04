import { describe, expect, it } from 'vitest';

import {
  addDays,
  dayRange,
  formatDate,
  formatRelativeDate,
  formatShortDate,
  isDateKey,
  startOfWeek,
  todayKey,
  weekday,
} from './dates.ts';

describe('Datum im Plan', () => {
  it('rechnet über Monats- und Jahreswechsel und die Zeitumstellung', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayRange('2026-10-04', 3)).toEqual(['2026-10-04', '2026-10-05', '2026-10-06']);
  });

  it('kennt Wochentage und den Wochenanfang am Montag', () => {
    expect(weekday('2026-10-05')).toBe(0);
    expect(weekday('2026-10-04')).toBe(6);
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28');
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
  });

  it('formatiert Tage auf Deutsch', () => {
    expect(formatDate('2026-10-06')).toBe('Di, 6. Okt.');
    expect(formatShortDate('2026-10-06')).toBe('Di 6.10.');
    expect(formatRelativeDate('2026-10-04', '2026-10-04')).toBe('Heute');
    expect(formatRelativeDate('2026-10-05', '2026-10-04')).toBe('Morgen');
    expect(formatRelativeDate('2026-10-08', '2026-10-04')).toBe('Do, 8. Okt.');
  });

  it('nimmt das lokale Datum und erkennt gültige Tage', () => {
    expect(todayKey(new Date(2026, 9, 4, 23, 30))).toBe('2026-10-04');
    expect(isDateKey('2026-10-04')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('4.10.2026')).toBe(false);
  });
});
