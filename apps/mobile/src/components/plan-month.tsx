import { dayOfMonth, formatDate, weekdayLabel, type PlanEntryView } from '@zauberjournal/core';
import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, Vibration, View, type GestureResponderEvent } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme';

import { Button } from './ui';

const WEEKS = 5;
/** So weit links und über dem Finger schwebt das Gezogene, damit der Finger es nicht verdeckt. */
const GHOST_OFFSET = { x: 36, y: 58 };

type Span = { start: number; size: number };

type PlanMonthProps = {
  /** Fünf Wochen ab Montag */
  days: readonly string[];
  today: string;
  byDay: ReadonlyMap<string, PlanEntryView[]>;
  onOpenDay: (day: string) => void;
  /** Gerichte von `from` nach `to`; was dort steht, kommt im Tausch zurück. */
  onMove: (from: string, to: string) => void;
  /** Solange ein Tag aufgenommen ist, soll die Seite nicht scrollen. */
  onPickChange: (picked: boolean) => void;
};

function movable(entries: readonly PlanEntryView[] | undefined): PlanEntryView[] {
  return (entries ?? []).filter((entry) => entry.status !== 'cooked');
}

/**
 * Monatsansicht des Plans. Einen Tag lange drücken nimmt seine Gerichte auf: ziehen und über einem anderen Tag
 * loslassen verschiebt sie, Loslassen ohne Ziehen und dann einen Tag antippen auch. Ziel ist heute oder später.
 */
export function PlanMonth({ days, today, byDay, onOpenDay, onMove, onPickChange }: PlanMonthProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [ghost] = useState(() => new Animated.ValueXY());
  // Lage der Wochen und Spalten im Raster, aus `onLayout`
  const rows = useRef<Span[]>([]);
  const columns = useRef<Span[]>([]);
  /** Wo der Finger beim langen Drücken lag, im Raster, und wo das Ziehen auf dem Bildschirm begann */
  const start = useRef({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });
  /** Der Finger liegt noch vom langen Drücken auf; nur dann darf das Ziehen beginnen. */
  const pressing = useRef(false);
  const current = useRef<{ picked: string | null; hover: string | null }>({ picked: null, hover: null });

  const reset = () => {
    current.current = { picked: null, hover: null };
    pressing.current = false;
    setPicked(null);
    setHover(null);
    setDragging(false);
    onPickChange(false);
  };

  const drop = (target: string | null) => {
    const from = current.current.picked;
    if (from && target && target !== from && target >= today) onMove(from, target);
    reset();
  };

  const dayAt = (x: number, y: number): string | null => {
    const week = rows.current.findIndex((row) => row !== undefined && y >= row.start && y < row.start + row.size);
    const column = columns.current.findIndex((col) => col !== undefined && x >= col.start && x < col.start + col.size);
    return week >= 0 && column >= 0 ? (days[week * 7 + column] ?? null) : null;
  };

  // Nur Verschiebungen auf dem Bildschirm zählen: So passt es auf dem Handy wie im Browser.
  const follow = (event: GestureResponderEvent) => {
    const x = start.current.x + event.nativeEvent.pageX - origin.current.x;
    const y = start.current.y + event.nativeEvent.pageY - origin.current.y;
    ghost.setValue({ x: x - GHOST_OFFSET.x, y: y - GHOST_OFFSET.y });
    const day = dayAt(x, y);
    if (day !== current.current.hover) {
      current.current.hover = day;
      setHover(day);
    }
  };

  const pickUp = (day: string, event?: GestureResponderEvent, week = 0, column = 0) => {
    if (movable(byDay.get(day)).length === 0) return;
    Vibration.vibrate(15);
    current.current = { picked: day, hover: null };
    setPicked(day);
    onPickChange(true);
    if (!event) return;
    pressing.current = true;
    start.current = {
      x: (columns.current[column]?.start ?? 0) + event.nativeEvent.locationX,
      y: (rows.current[week]?.start ?? 0) + event.nativeEvent.locationY,
    };
    origin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
    ghost.setValue({ x: start.current.x - GHOST_OFFSET.x, y: start.current.y - GHOST_OFFSET.y });
  };

  const pickedEntries = movable(picked ? byDay.get(picked) : undefined);
  const pickedTitle = pickedEntries[0]?.title ?? '';
  const target = hover && hover !== picked && hover >= today ? hover : null;

  return (
    <View
      style={styles.month}
      // Nach dem langen Drücken übernimmt das Raster die Bewegung des Fingers vom Tag.
      onMoveShouldSetResponderCapture={() => pressing.current}
      onResponderGrant={() => {
        pressing.current = false;
        setDragging(true);
      }}
      onResponderMove={follow}
      onResponderRelease={() => drop(current.current.hover)}
      onResponderTerminate={reset}
      onResponderTerminationRequest={() => false}>
      <View style={styles.weekRow}>
        {Array.from({ length: 7 }, (_, index) => (
          <Text key={index} style={styles.weekdayHeader}>
            {weekdayLabel(index)}
          </Text>
        ))}
      </View>
      {Array.from({ length: WEEKS }, (_, week) => (
        <View
          key={week}
          style={styles.weekRow}
          onLayout={(event) => {
            rows.current[week] = { start: event.nativeEvent.layout.y, size: event.nativeEvent.layout.height };
          }}>
          {days.slice(week * 7, week * 7 + 7).map((day, column) => {
            const dayEntries = byDay.get(day) ?? [];
            const canMove = movable(dayEntries).length > 0;
            const isToday = day === today;
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={`${formatDate(day)}: ${dayEntries.map((entry) => entry.title).join(', ') || 'nichts geplant'}`}
                accessibilityActions={canMove ? [{ name: 'longpress', label: 'Gerichte verschieben' }] : undefined}
                onAccessibilityAction={(event) => event.nativeEvent.actionName === 'longpress' && pickUp(day)}
                delayLongPress={350}
                onLongPress={canMove ? (event) => pickUp(day, event, week, column) : undefined}
                onPressOut={() => {
                  pressing.current = false;
                }}
                onPress={() => (picked ? drop(day) : onOpenDay(day))}
                onLayout={(event) => {
                  columns.current[column] = { start: event.nativeEvent.layout.x, size: event.nativeEvent.layout.width };
                }}
                style={[
                  styles.cell,
                  isToday && styles.todayCell,
                  day < today && styles.past,
                  day === picked && styles.pickedCell,
                  day === target && styles.targetCell,
                ]}>
                {/* Ohne Ziele darin bezieht sich die Position des Fingers immer auf den ganzen Tag. */}
                <View pointerEvents="none" style={styles.cellContent}>
                  <View style={[styles.cellDay, isToday && styles.cellDayToday]}>
                    <Text style={[styles.cellDayText, isToday && styles.cellDayTextToday]}>{dayOfMonth(day)}</Text>
                  </View>
                  {dayEntries.slice(0, 2).map((entry) => (
                    <Text key={entry.id} numberOfLines={1} style={styles.cellEntry}>
                      {entry.title}
                    </Text>
                  ))}
                  {dayEntries.length > 2 ? <Text style={styles.cellMore}>+{dayEntries.length - 2}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      {picked ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {dragging
              ? `„${pickedTitle}“ über dem neuen Tag loslassen.`
              : `„${pickedTitle}“ verschieben: jetzt den neuen Tag antippen. Steht dort schon etwas, tauschen die Tage.`}
          </Text>
          {dragging ? null : <Button small variant="ghost" title="Abbrechen" onPress={reset} />}
        </View>
      ) : (
        <Text style={styles.hint}>
          Tipp: Einen Tag antippen, um ihn in der Wochenansicht zu planen. Lange drücken und auf einen anderen Tag ziehen
          verschiebt die Gerichte; steht dort schon etwas, tauschen die Tage.
        </Text>
      )}
      {dragging && pickedTitle ? (
        <Animated.View pointerEvents="none" style={[styles.ghost, { transform: ghost.getTranslateTransform() }]}>
          <Text numberOfLines={1} style={styles.ghostText}>
            {pickedTitle}
          </Text>
          {pickedEntries.length > 1 ? <Text style={styles.ghostMore}>+{pickedEntries.length - 1}</Text> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  month: { gap: 4 },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekdayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  cell: {
    flex: 1,
    minHeight: 78,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  cellContent: { flex: 1, padding: 3, gap: 2 },
  todayCell: { borderColor: colors.primary, borderWidth: 1.5 },
  past: { opacity: 0.5 },
  pickedCell: { borderColor: colors.primary, borderStyle: 'dashed', borderWidth: 1.5, opacity: 0.55 },
  targetCell: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  cellDay: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cellDayToday: { backgroundColor: colors.primary },
  cellDayText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  cellDayTextToday: { color: colors.primaryText },
  cellEntry: {
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  cellMore: { fontSize: 10, fontWeight: '600', color: colors.textMuted, paddingHorizontal: 3 },
  hint: { marginTop: spacing.md, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  banner: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  ghost: {
    position: 'absolute',
    top: 0,
    left: 0,
    maxWidth: 170,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    boxShadow: shadows.raised,
  },
  ghostText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.primary },
  ghostMore: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
});
