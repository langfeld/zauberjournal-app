import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, Vibration, View } from 'react-native';

import { stopTimer, useTimers } from '@/data/timers';
import { colors, fonts, radius, spacing } from '@/theme';

import { Icon } from './icon';
import { IconButton } from './ui';

/** Restzeit wie auf einer Küchenuhr: „9:05“, „1:02:30“. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** Laufende und abgelaufene Kochtimer; die Anzeige läuft, solange einer da ist. */
export function CookingTimers() {
  const timers = useTimers();
  const [now, setNow] = useState(() => Date.now());
  const signaled = useRef(new Set<string>());

  useEffect(() => {
    if (timers.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [timers.length]);

  // Ohne Alarm (im Browser oder ohne Erlaubnis für Benachrichtigungen) vibriert die App selbst.
  useEffect(() => {
    for (const timer of timers) {
      if (timer.endsAt > now || signaled.current.has(timer.id)) continue;
      signaled.current.add(timer.id);
      if (!timer.alarmId) Vibration.vibrate([0, 500, 300, 500]);
    }
  }, [timers, now]);

  if (timers.length === 0) return null;
  return (
    <View style={styles.list}>
      {timers.map((timer) => {
        const done = timer.endsAt <= now;
        return (
          <View key={timer.id} style={[styles.timer, done && styles.done]}>
            <Icon name="timer" size={22} color={done ? colors.accent : colors.primary} />
            <View style={styles.text}>
              <Text style={styles.label} numberOfLines={1}>
                {timer.label}
              </Text>
              <Text style={styles.title} numberOfLines={1}>
                {timer.title}
              </Text>
            </View>
            <Text style={[styles.time, done && styles.timeDone]}>{done ? 'Fertig!' : formatRemaining(timer.endsAt - now)}</Text>
            <IconButton
              icon="close"
              size={36}
              variant="muted"
              accessibilityLabel={done ? `Timer „${timer.label}“ schließen` : `Timer „${timer.label}“ abbrechen`}
              onPress={() => stopTimer(timer.id)}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  done: { backgroundColor: colors.accentSoft },
  text: { flex: 1 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  title: { fontSize: 13, color: colors.textMuted },
  time: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.primary, fontVariant: ['tabular-nums'] },
  timeDone: { color: colors.accent },
});
