import {
  addDays,
  createDietLookup,
  dayOfMonth,
  dayRange,
  describePlanEntry,
  formatDate,
  formatRelativeDate,
  formatShortDate,
  listPlanEntries,
  PLAN_STATUS_LABELS,
  startOfWeek,
  weekday,
  weekdayLabel,
  type PlanEntryView,
} from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MEAL_ICONS } from '@/components/category-style';
import { Icon, type IconName } from '@/components/icon';
import { RecipeThumbnail } from '@/components/recipe-photo';
import { Button, IconButton, Segmented, Tag } from '@/components/ui';
import { useActiveMeals, useAppTables, useToday } from '@/data/tables';
import { colors, fonts, radius, shadows, spacing, tones, type Tone } from '@/theme';

type Mode = 'week' | 'month';

const MODES = [
  { id: 'week', label: 'Woche' },
  { id: 'month', label: 'Monat' },
] as const;

const WEEK_DAYS = 7;
const MONTH_WEEKS = 5;

function statusTag(entry: PlanEntryView): { label: string; icon: IconName; tone: Tone } | null {
  if (entry.status === 'cooked') return { label: PLAN_STATUS_LABELS.cooked, icon: 'task_alt', tone: tones.green };
  if (entry.status === 'shopped') return { label: PLAN_STATUS_LABELS.shopped, icon: 'shopping_basket', tone: tones.teal };
  return entry.shoppingListId ? { label: 'auf der Einkaufsliste', icon: 'shopping_cart', tone: tones.ochre } : null;
}

function EntryRow({ entry }: { entry: PlanEntryView }) {
  const status = statusTag(entry);
  const description = describePlanEntry(entry);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/plan/${entry.id}`)}
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}>
      <RecipeThumbnail photoId={entry.recipe?.photo ?? ''} title={entry.title} size={48} />
      <View style={styles.entryText}>
        <Text style={[styles.entryTitle, entry.status === 'cooked' && styles.done]} numberOfLines={2}>
          {entry.title}
        </Text>
        {description ? <Text style={styles.meta}>{description}</Text> : null}
        {status ? <Tag icon={status.icon} label={status.label} tone={status.tone} /> : null}
      </View>
      <Icon name="chevron_right" size={20} color={colors.borderStrong} />
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
        <Segmented options={MODES} value={mode} onChange={setMode} />
        <View style={styles.spacer} />
        <IconButton
          icon="chevron_left"
          variant="secondary"
          size={36}
          accessibilityLabel="Früher"
          onPress={() => setAnchor(addDays(start, -step))}
        />
        <Button small variant="ghost" title="Heute" disabled={anchor === null} onPress={() => setAnchor(null)} />
        <IconButton
          icon="chevron_right"
          variant="secondary"
          size={36}
          accessibilityLabel="Später"
          onPress={() => setAnchor(addDays(start, step))}
        />
      </View>
      <Text style={styles.range}>
        {formatShortDate(start)} – {formatShortDate(end)}
      </Text>

      <ScrollView contentContainerStyle={styles.content}>
        {mode === 'week' ? (
          days.map((day) => {
            const isToday = day === today;
            const relative = formatRelativeDate(day, today);
            return (
              <View key={day} style={[styles.day, isToday && styles.today]}>
                <View style={[styles.dateBadge, isToday && styles.dateBadgeToday, day < today && styles.dateBadgePast]}>
                  <Text style={[styles.dateWeekday, isToday && styles.dateTextToday]}>{weekdayLabel(weekday(day))}</Text>
                  <Text style={[styles.dateNumber, isToday && styles.dateTextToday]}>{dayOfMonth(day)}</Text>
                </View>
                <View style={styles.dayBody}>
                  {relative !== formatDate(day) ? <Text style={styles.relative}>{relative}</Text> : null}
                  {meals.map((meal) => {
                    const mealEntries = (byDay.get(day) ?? []).filter((entry) => entry.meal === meal.id);
                    return (
                      <View key={meal.id} style={styles.meal}>
                        {meals.length > 1 ? (
                          <View style={styles.mealLabel}>
                            <Icon name={MEAL_ICONS[meal.id]} size={15} color={colors.textMuted} />
                            <Text style={styles.mealLabelText}>{meal.label}</Text>
                          </View>
                        ) : null}
                        {mealEntries.map((entry) => (
                          <EntryRow key={entry.id} entry={entry} />
                        ))}
                        <View style={styles.addRow}>
                          <Button
                            small
                            variant="ghost"
                            icon="add"
                            title="Gericht"
                            accessibilityLabel={`${meal.label} am ${formatDate(day)} planen`}
                            onPress={() => router.push({ pathname: '/plan/add', params: { date: day, meal: meal.id } })}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })
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
                  const isToday = day === today;
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatDate(day)}: ${dayEntries.map((entry) => entry.title).join(', ') || 'nichts geplant'}`}
                      onPress={() => showDay(day)}
                      style={[styles.cell, isToday && styles.todayCell, day < today && styles.past]}>
                      <View style={[styles.cellDay, isToday && styles.cellDayToday]}>
                        <Text style={[styles.cellDayText, isToday && styles.dateTextToday]}>{dayOfMonth(day)}</Text>
                      </View>
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
    paddingTop: spacing.sm,
  },
  spacer: { flex: 1 },
  range: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: colors.textMuted,
  },
  content: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  day: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  today: { borderColor: colors.primary, borderWidth: 1.5 },
  dateBadge: {
    width: 52,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
  },
  dateBadgeToday: { backgroundColor: colors.primary },
  dateBadgePast: { opacity: 0.55 },
  dateWeekday: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted },
  dateNumber: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  dateTextToday: { color: colors.primaryText },
  dayBody: { flex: 1, gap: spacing.xs },
  relative: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.primary },
  meal: { gap: spacing.xs },
  mealLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  mealLabelText: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.4, color: colors.textMuted, textTransform: 'uppercase' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  entryText: { flex: 1, gap: 3 },
  entryTitle: { fontFamily: fonts.display, fontSize: 16.5, lineHeight: 21, color: colors.text },
  done: { color: colors.textMuted },
  meta: { fontSize: 13, color: colors.textMuted },
  addRow: { flexDirection: 'row', marginLeft: -spacing.sm },
  pressed: { opacity: 0.7 },
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
    padding: 3,
    gap: 2,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  todayCell: { borderColor: colors.primary, borderWidth: 1.5 },
  past: { opacity: 0.5 },
  cellDay: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cellDayToday: { backgroundColor: colors.primary },
  cellDayText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
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
});
