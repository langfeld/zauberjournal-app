import {
  addDays,
  createDietLookup,
  dayOfMonth,
  dayRange,
  describePlanEntry,
  formatDate,
  formatRelativeDate,
  listPlanEntries,
  PLAN_STATUS_LABELS,
  startOfWeek,
  weekdayLabel,
  type PlanEntryView,
} from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RecipeThumbnail } from '@/components/recipe-photo';
import { Button, Chip } from '@/components/ui';
import { useActiveMeals, useAppTables, useToday } from '@/data/tables';
import { colors, radius, spacing } from '@/theme';

type Mode = 'week' | 'month';

const WEEK_DAYS = 7;
const MONTH_WEEKS = 5;

function statusLabel(entry: PlanEntryView): string | null {
  if (entry.status !== 'planned') return PLAN_STATUS_LABELS[entry.status];
  return entry.shoppingListId ? 'auf der Einkaufsliste' : null;
}

function EntryRow({ entry }: { entry: PlanEntryView }) {
  const status = statusLabel(entry);
  const description = describePlanEntry(entry);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/plan/${entry.id}`)}
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}>
      <RecipeThumbnail photoId={entry.recipe?.photo ?? ''} title={entry.title} size={44} />
      <View style={styles.entryText}>
        <Text style={[styles.entryTitle, entry.status === 'cooked' && styles.done]}>{entry.title}</Text>
        {description || status ? (
          <Text style={styles.meta}>{[description, status].filter(Boolean).join(' · ')}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function PlanScreen() {
  const tables = useAppTables();
  const meals = useActiveMeals();
  const today = useToday();
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState<string | null>(null);

  const start = mode === 'week' ? (anchor ?? today) : startOfWeek(anchor ?? today);
  const dayCount = mode === 'week' ? WEEK_DAYS : MONTH_WEEKS * 7;
  const step = mode === 'week' ? WEEK_DAYS : 28;
  const end = addDays(start, dayCount - 1);
  const days = dayRange(start, dayCount);

  const entries = useMemo(() => listPlanEntries(tables, start, end, createDietLookup(tables)), [tables, start, end]);
  const byDay = useMemo(() => {
    const map = new Map<string, PlanEntryView[]>();
    for (const entry of entries) map.set(entry.date, [...(map.get(entry.date) ?? []), entry]);
    return map;
  }, [entries]);

  const showDay = (day: string) => {
    setMode('week');
    setAnchor(day);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Plan' }} />
      <View style={styles.toolbar}>
        <Chip label="Woche" selected={mode === 'week'} onPress={() => setMode('week')} />
        <Chip label="Monat" selected={mode === 'month'} onPress={() => setMode('month')} />
        <View style={styles.spacer} />
        <Button small variant="secondary" title="‹" accessibilityLabel="Früher" onPress={() => setAnchor(addDays(start, -step))} />
        <Button small variant="ghost" title="Heute" disabled={anchor === null} onPress={() => setAnchor(null)} />
        <Button small variant="secondary" title="›" accessibilityLabel="Später" onPress={() => setAnchor(addDays(start, step))} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {mode === 'week' ? (
          days.map((day) => (
            <View key={day} style={[styles.day, day === today && styles.today]}>
              <Text style={styles.dayTitle}>
                {formatRelativeDate(day, today)}
                {formatRelativeDate(day, today) !== formatDate(day) ? (
                  <Text style={styles.dayDate}> · {formatDate(day)}</Text>
                ) : null}
              </Text>
              {meals.map((meal) => {
                const mealEntries = (byDay.get(day) ?? []).filter((entry) => entry.meal === meal.id);
                return (
                  <View key={meal.id} style={styles.meal}>
                    {meals.length > 1 ? <Text style={styles.mealLabel}>{meal.label}</Text> : null}
                    {mealEntries.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} />
                    ))}
                    <View style={styles.addRow}>
                      <Button
                        small
                        variant="ghost"
                        title="+ Gericht"
                        accessibilityLabel={`${meal.label} am ${formatDate(day)} planen`}
                        onPress={() => router.push({ pathname: '/plan/add', params: { date: day, meal: meal.id } })}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        ) : (
          <View style={styles.month}>
            <View style={styles.weekRow}>
              {Array.from({ length: 7 }, (_, index) => (
                <Text key={index} style={styles.weekdayHeader}>
                  {weekdayLabel(index)}
                </Text>
              ))}
            </View>
            {Array.from({ length: MONTH_WEEKS }, (_, week) => (
              <View key={week} style={styles.weekRow}>
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const dayEntries = byDay.get(day) ?? [];
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatDate(day)}: ${dayEntries.map((entry) => entry.title).join(', ') || 'nichts geplant'}`}
                      onPress={() => showDay(day)}
                      style={[styles.cell, day === today && styles.todayCell, day < today && styles.past]}>
                      <Text style={[styles.cellDay, day === today && styles.cellToday]}>{dayOfMonth(day)}</Text>
                      {dayEntries.slice(0, 2).map((entry) => (
                        <Text key={entry.id} numberOfLines={1} style={styles.cellEntry}>
                          {entry.title}
                        </Text>
                      ))}
                      {dayEntries.length > 2 ? <Text style={styles.cellMore}>+{dayEntries.length - 2}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <Text style={styles.hint}>Tipp: Einen Tag antippen, um ihn in der Wochenansicht zu planen.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  spacer: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  day: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  today: { borderColor: colors.primary },
  dayTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  dayDate: { fontSize: 14, fontWeight: '400', color: colors.textMuted },
  meal: { gap: spacing.xs },
  mealLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  entryText: { flex: 1, gap: 2 },
  entryTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  done: { color: colors.textMuted },
  meta: { fontSize: 13, color: colors.textMuted },
  addRow: { flexDirection: 'row' },
  pressed: { opacity: 0.7 },
  month: { gap: 2 },
  weekRow: { flexDirection: 'row', gap: 2 },
  weekdayHeader: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.textMuted },
  cell: {
    flex: 1,
    minHeight: 72,
    padding: 3,
    gap: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayCell: { borderColor: colors.primary, borderWidth: 2 },
  past: { opacity: 0.55 },
  cellDay: { fontSize: 13, fontWeight: '700', color: colors.text },
  cellToday: { color: colors.primary },
  cellEntry: { fontSize: 10, color: colors.text },
  cellMore: { fontSize: 10, color: colors.textMuted },
  hint: { marginTop: spacing.md, fontSize: 14, color: colors.textMuted },
});
