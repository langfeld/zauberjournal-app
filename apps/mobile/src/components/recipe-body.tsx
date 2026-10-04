import { displayIngredient, type Distribution, type RecipeView } from '@zauberjournal/core';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { IngredientRows } from './ingredient-rows';
import { SectionTitle } from './ui';

function portions(count: number): string {
  return `${count} ${count === 1 ? 'Portion' : 'Portionen'}`;
}

type RecipeBodyProps = {
  view: RecipeView;
  /** Gewünschte Portionen insgesamt. */
  servings: number;
  /** Portionen je Option jeder Wahlkomponente. */
  distribution: Distribution;
};

/** Zutaten und Zubereitung für die gewünschten Portionen; Schritte nur für Optionen, die jemand bekommt. */
export function RecipeBody({ view, servings, distribution }: RecipeBodyProps) {
  const optionServings = new Map<string, number>();
  const optionNames = new Map<string, string>();
  for (const group of view.groups) {
    for (const option of group.options) {
      optionServings.set(option.id, distribution[group.id]?.[option.id] ?? 0);
      optionNames.set(option.id, option.name);
    }
  }
  const steps = view.steps.filter((step) => !step.optionId || (optionServings.get(step.optionId) ?? 0) > 0);

  return (
    <>
      <SectionTitle>Zutaten</SectionTitle>
      <IngredientRows items={view.ingredients.map((item) => displayIngredient(item, servings / view.servings))} />
      {view.groups.map((group) =>
        group.options.map((option) => {
          const count = optionServings.get(option.id) ?? 0;
          if (count === 0) return null;
          return (
            <View key={option.id} style={styles.optionBlock}>
              <Text style={styles.optionTitle}>
                {option.name} · {portions(count)}
              </Text>
              <IngredientRows items={option.ingredients.map((item) => displayIngredient(item, count / view.servings))} />
            </View>
          );
        }),
      )}

      {steps.length > 0 ? <SectionTitle>Zubereitung</SectionTitle> : null}
      {steps.map((step, index) => (
        <View key={step.id} style={styles.step}>
          <Text style={styles.stepNumber}>{index + 1}</Text>
          <View style={styles.stepBody}>
            {step.optionId ? <Text style={styles.badge}>Nur {optionNames.get(step.optionId)}</Text> : null}
            <Text style={styles.body}>{step.text}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  optionBlock: { gap: spacing.sm, marginTop: spacing.sm },
  optionTitle: { fontSize: 16, fontWeight: '700', color: colors.primary },
  step: { flexDirection: 'row', gap: spacing.md },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '700',
    color: colors.primaryText,
    backgroundColor: colors.primary,
    overflow: 'hidden',
  },
  stepBody: { flex: 1, gap: spacing.xs },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
  },
});
