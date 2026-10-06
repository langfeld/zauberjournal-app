import {
  cookingSteps,
  createDietLookup,
  displayIngredient,
  needsSeparatePans,
  planSetStatus,
  type Distribution,
  type PlanStatus,
  type RecipeView,
} from '@zauberjournal/core';
import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables } from '@/data/tables';
import { startTimer } from '@/data/timers';
import { colors, fonts, spacing, tones } from '@/theme';

import { CookingTimers } from './cooking-timers';
import { Icon } from './icon';
import { IngredientRows } from './ingredient-rows';
import { RecipeIngredients } from './recipe-body';
import { Button, Card, Hint, Notice, ProgressBar, Tag } from './ui';

function portions(count: number): string {
  return `${count} ${count === 1 ? 'Portion' : 'Portionen'}`;
}

type CookingModeProps = {
  view: RecipeView;
  servings: number;
  distribution: Distribution;
  /** Aus dem Plan: Am Ende lässt sich das Gericht als gekocht eintragen. */
  entry?: { id: string; status: PlanStatus };
};

/**
 * Kochmodus: erst die Zutaten, dann ein Schritt nach dem anderen, groß und mit den Mengen, die er braucht.
 * Zeitangaben werden zu Timern. Der Bildschirm bleibt an, solange der Kochmodus offen ist.
 */
export function CookingMode({ view, servings, distribution, entry }: CookingModeProps) {
  useKeepAwake();
  const store = useStore();
  const tables = useAppTables();
  const steps = useMemo(() => cookingSteps(view, servings, distribution), [view, servings, distribution]);
  const separate = useMemo(() => needsSeparatePans(view, distribution, createDietLookup(tables)), [view, distribution, tables]);
  // 0 = Zutaten, 1 … n = Schritte, n + 1 = fertig
  const [page, setPage] = useState(0);
  const last = steps.length + 1;
  const step = page >= 1 && page <= steps.length ? steps[page - 1] : undefined;

  const markCooked = () => {
    if (!store || !entry) return;
    applyWrites(store, planSetStatus(tables, entry.id, 'cooked', Date.now()));
    router.back();
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: view.title }} />
      <View style={styles.progress}>
        <Text style={styles.progressText}>
          {page === 0 ? 'Zutaten bereitlegen' : step ? `Schritt ${page} von ${steps.length}` : 'Fertig'}
        </Text>
        <ProgressBar value={page / last} />
      </View>

      {/* Neuer Schlüssel je Seite: Jede Seite beginnt oben. */}
      <ScrollView key={page} contentContainerStyle={styles.content}>
        {page === 0 ? (
          <>
            {separate ? (
              <Notice title="Getrennt kochen">
                Das Vegetarische zuerst zubereiten oder eine eigene Pfanne und ein eigenes Brett nehmen.
              </Notice>
            ) : null}
            <RecipeIngredients view={view} servings={servings} distribution={distribution} />
            <Hint>Der Bildschirm bleibt an, solange der Kochmodus offen ist.</Hint>
          </>
        ) : step ? (
          <>
            {step.optionName ? (
              <Tag icon="alt_route" label={`Nur ${step.optionName} · ${portions(step.servings)}`} tone={tones.green} />
            ) : null}
            <Text style={styles.stepText}>{step.text}</Text>
            {step.ingredients.length > 0 ? (
              <Card style={styles.ingredients}>
                <IngredientRows items={step.ingredients.map(({ item, factor }) => displayIngredient(item, factor))} />
              </Card>
            ) : null}
            {step.timers.map((timer) => (
              <Button
                key={timer.seconds}
                variant="secondary"
                icon="timer"
                title={`Timer: ${timer.label}`}
                onPress={() => startTimer(view.title, `Schritt ${page} · ${timer.label}`, timer.seconds, Date.now())}
              />
            ))}
          </>
        ) : (
          <View style={styles.finish}>
            <Icon name="task_alt" size={64} color={colors.primary} style={styles.finishIcon} />
            <Text style={styles.finishTitle}>Guten Appetit!</Text>
            {entry && entry.status !== 'cooked' ? (
              <>
                <Button icon="task_alt" title="Als gekocht eintragen" onPress={markCooked} />
                <Hint>Die Zutaten gehen dann vom Vorrat ab.</Hint>
              </>
            ) : null}
            <Button variant="secondary" title="Schließen" onPress={() => router.back()} />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <CookingTimers />
        <View style={styles.nav}>
          <View style={styles.navButton}>
            <Button variant="secondary" icon="chevron_left" title="Zurück" disabled={page === 0} onPress={() => setPage(page - 1)} />
          </View>
          {page < last ? (
            <View style={styles.navButton}>
              <Button
                icon={page === steps.length ? 'task_alt' : undefined}
                title={page === steps.length ? 'Fertig' : page === 0 ? 'Los geht’s' : 'Weiter'}
                onPress={() => setPage(page + 1)}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  progress: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  progressText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  stepText: { fontSize: 24, lineHeight: 34, color: colors.text },
  ingredients: { paddingVertical: spacing.sm },
  finish: { alignItems: 'stretch', gap: spacing.md, paddingTop: spacing.xl },
  finishIcon: { alignSelf: 'center' },
  finishTitle: { alignSelf: 'center', fontFamily: fonts.display, fontSize: 28, lineHeight: 36, color: colors.text },
  footer: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  nav: { flexDirection: 'row', gap: spacing.md },
  navButton: { flex: 1 },
});
