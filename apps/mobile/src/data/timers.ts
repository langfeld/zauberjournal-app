import { createId } from '@zauberjournal/core';
import { useSyncExternalStore } from 'react';

import { cancelAlarm, scheduleAlarm } from './alarm';

/**
 * Kochtimer. Sie leben im Speicher der App und laufen weiter, wenn man den Kochmodus verlässt; der Alarm
 * kommt als geplante Benachrichtigung. Mit der App beendet, sind sie weg, der Alarm klingelt trotzdem.
 */
export type CookingTimer = {
  id: string;
  /** Gericht, z. B. „Rotes Curry“. */
  title: string;
  /** Wofür, z. B. „Schritt 3 · 10 Minuten“. */
  label: string;
  endsAt: number;
  /** ID des Alarms; `null` ohne Erlaubnis für Benachrichtigungen (dann nur Vibration in der App). */
  alarmId: string | null;
};

let timers: readonly CookingTimer[] = [];
const listeners = new Set<() => void>();

function update(next: readonly CookingTimer[]) {
  timers = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTimers(): readonly CookingTimer[] {
  return useSyncExternalStore(subscribe, () => timers);
}

export function startTimer(title: string, label: string, seconds: number, now: number): void {
  const id = createId();
  update([...timers, { id, title, label, endsAt: now + seconds * 1000, alarmId: null }]);
  scheduleAlarm(`${title}: Die Zeit ist um`, label, seconds)
    .then((alarmId) => {
      if (!alarmId) return;
      // Wurde der Timer inzwischen beendet, braucht es auch den Alarm nicht mehr.
      if (timers.some((timer) => timer.id === id)) update(timers.map((timer) => (timer.id === id ? { ...timer, alarmId } : timer)));
      else void cancelAlarm(alarmId).catch(() => {});
    })
    .catch(() => {});
}

/** Beendet einen Timer, ob er noch läuft oder schon abgelaufen ist; sein Alarm entfällt. */
export function stopTimer(id: string): void {
  const timer = timers.find((entry) => entry.id === id);
  update(timers.filter((entry) => entry.id !== id));
  if (timer?.alarmId) void cancelAlarm(timer.alarmId).catch(() => {});
}
