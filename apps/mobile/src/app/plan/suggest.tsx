import {
  addDays,
  createId,
  createPlanner,
  draftDates,
  formatDate,
  formatRelativeDate,
  planAddEntry,
  type DraftPick,
  type MealId,
  type Suggestion,
} from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MEAL_ICONS } from '@/components/category-style';
import { SuggestionCard } from '@/components/suggestion-card';
import { Button, Card, Chip, Hint, IconButton, Segmented, Stepper, type SegmentOption } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useActiveMeals, useAppTables, useToday } from '@/data/tables';
import { colors, fonts, spacing } from '@/theme';

type Start = 'today' | 'tomorrow';

const STARTS: SegmentOption<Start>[] = [
  { id: 'today', label: 'ab heute' },
  { id: 'tomorrow', label: 'ab morgen' },
];

const MAX_DAYS = 14;

/** Gerichte für einige freie Tage automatisch vorschlagen; erst „Einplanen“ trägt sie in den Plan ein. */
export default function SuggestScreen() {
  const tables = useAppTables();
  const today = useToday();
  const meals = useActiveMeals();
  const [days, setDays] = useState(3);
  // Am Abend ist das Essen für heute meist schon entschieden.
  const [start, setStart] = useState<Start>(() => (new Date().getHours() < 15 ? 'today' : 'tomorrow'));
  const [chosenMeal, setMeal] = useState<MealId | null>(null);
  const meal = chosenMeal ?? (meals.some((option) => option.id === 'dinner') ? 'dinner' : (meals[0]?.id ?? 'dinner'));
  const first = start === 'today' ? today : addDays(today, 1);
  const dates = useMemo(() => draftDates(tables, first, days, meal), [tables, first, days, meal]);
  // Belegte Tage am Anfang zeigt der Entwurf nicht.
  const planned = dates[0] && dates[0] > first ? addDays(dates[0], -1) : null;

  const settings = (
    <>
      <Card>
        <Text style={styles.question}>Für wie viele Tage?</Text>
        <Stepper
          icon="calendar_month"
          label="Tage"
          value={days}
          canDecrease={days > 1}
          canIncrease={days < MAX_DAYS}
          onDecrease={() => setDays(days - 1)}
          onIncrease={() => setDays(days + 1)}
        />
        <Segmented options={STARTS} value={start} onChange={setStart} small />
        {planned ? <Text style={styles.muted}>{`Bis ${formatDate(planned)} ist schon alles geplant.`}</Text> : null}
        {meals.length > 1 ? (
          <View style={styles.chips}>
            {meals.map((option) => (
              <Chip key={option.id} icon={MEAL_ICONS[option.id]} label={option.label} selected={meal === option.id} onPress={() => setMeal(option.id)} />
            ))}
          </View>
        ) : null}
      </Card>
      <Hint>
        Belegte Tage zählen nicht mit. Vorne steht, was den Vorrat nutzt und bald abläuft, dazu kommt Abwechslung. Was geplante
        Gerichte brauchen, bleibt für sie reserviert.
      </Hint>
    </>
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Vorschlagen' }} />
      {/* Neue Auswahl, neuer Entwurf */}
      <Draft key={`${first}~${days}~${meal}`} header={settings} dates={dates} meal={meal} today={today} />
    </View>
  );
}

type Change = { recipeId: string | null; rejected: string[] };

function Draft({ header, dates, meal, today }: { header: ReactNode; dates: string[]; meal: MealId; today: string }) {
  const store = useStore();
  const tables = useAppTables();
  const planner = useMemo(() => createPlanner(tables, today, meal), [tables, today, meal]);
  const initial = useMemo(() => new Map(planner.draft(dates).map((pick) => [pick.date, pick.recipeId])), [planner, dates]);
  const [changes, setChanges] = useState<Record<string, Change>>({});

  // Was an diesen Tagen schon geplant ist, bleibt.
  const occupied = useMemo(() => {
    const titles = new Map<string, string[]>();
    for (const entry of Object.values(tables.planEntries)) {
      if (entry.deletedAt !== null || entry.meal !== meal || !dates.includes(entry.date)) continue;
      const title = entry.recipeId ? (tables.recipes[entry.recipeId]?.title ?? '') : entry.text;
      titles.set(entry.date, [...(titles.get(entry.date) ?? []), title]);
    }
    return titles;
  }, [tables, meal, dates]);

  const pickOf = (date: string) => (date in changes ? changes[date]!.recipeId : (initial.get(date) ?? null));
  const picks: DraftPick[] = dates.flatMap((date) => {
    const recipeId = pickOf(date);
    return recipeId && !occupied.has(date) ? [{ date, recipeId }] : [];
  });
  const before = (date: string) => picks.filter((pick) => pick.date < date);
  const otherIds = (date: string) => picks.filter((pick) => pick.date !== date).map((pick) => pick.recipeId);

  const suggestionFor = (date: string, recipeId: string): Suggestion | undefined =>
    planner.suggest(date, { picks: before(date), exclude: otherIds(date), limit: Infinity }).find((entry) => entry.recipeId === recipeId);

  /** Nächster Vorschlag für einen Tag; mit `reject` kommt der bisherige nicht wieder. */
  const next = (date: string, reject: boolean) => {
    const current = pickOf(date);
    const rejected = [...(changes[date]?.rejected ?? []), ...(reject && current ? [current] : [])];
    const [best] = planner.suggest(date, { picks: before(date), exclude: [...rejected, ...otherIds(date)], limit: 1 });
    setChanges({ ...changes, [date]: { recipeId: best?.recipeId ?? null, rejected } });
  };
  const leaveFree = (date: string) => setChanges({ ...changes, [date]: { recipeId: null, rejected: changes[date]?.rejected ?? [] } });

  const apply = (now: number) => {
    if (!store || picks.length === 0) return;
    applyWrites(
      store,
      picks.flatMap((pick) => planAddEntry(tables, { date: pick.date, meal, recipeId: pick.recipeId, text: '' }, now, createId).writes),
    );
    router.back();
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        {header}
        {dates.map((date) => {
          const existing = occupied.get(date);
          const recipeId = pickOf(date);
          const suggestion = recipeId && !existing ? suggestionFor(date, recipeId) : undefined;
          return (
            <View key={date} style={styles.day}>
              <Text style={styles.date}>{formatRelativeDate(date, today)}</Text>
              {existing ? (
                <Text style={styles.muted}>{`Schon geplant: ${existing.join(', ')}`}</Text>
              ) : suggestion ? (
                <SuggestionCard
                  suggestion={suggestion}
                  trailing={
                    <View style={styles.actions}>
                      <IconButton
                        icon="refresh"
                        variant="secondary"
                        size={36}
                        accessibilityLabel={`Anderes Gericht für ${formatDate(date)}`}
                        onPress={() => next(date, true)}
                      />
                      <IconButton icon="close" variant="muted" size={36} accessibilityLabel={`${formatDate(date)} frei lassen`} onPress={() => leaveFree(date)} />
                    </View>
                  }
                />
              ) : (
                <View style={styles.free}>
                  <Text style={styles.muted}>Bleibt frei</Text>
                  <Button small variant="ghost" icon="auto_awesome" title="Vorschlagen" onPress={() => next(date, false)} />
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          icon="add"
          title={picks.length === 1 ? '1 Gericht einplanen' : `${picks.length} Gerichte einplanen`}
          disabled={picks.length === 0}
          onPress={() => apply(Date.now())}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  question: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  day: { gap: spacing.xs + 2 },
  date: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  muted: { fontSize: 15, color: colors.textMuted },
  free: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  actions: { gap: spacing.xs },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
