import { displayIngredient, type Distribution, type RecipeView } from '@zauberjournal/core';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing, tones } from '@/theme';

import { Icon } from './icon';
import { IngredientRows } from './ingredient-rows';
import { Card, SectionTitle, Tag } from './ui';

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
      {view.ingredients.length > 0 ? (
        <Card style={styles.ingredients}>
          <IngredientRows items={view.ingredients.map((item) => displayIngredient(item, servings / view.servings))} />
        </Card>
      ) : null}
      {view.groups.map((group) =>
        group.options.map((option) => {
          const count = optionServings.get(option.id) ?? 0;
          if (count === 0) return null;
          return (
            <Card key={option.id} style={styles.ingredients}>
              <View style={styles.optionTitle}>
                <Icon name="alt_route" size={18} color={colors.primary} />
                <Text style={styles.optionName}>{option.name}</Text>
                <Text style={styles.optionCount}>{portions(count)}</Text>
              </View>
              <IngredientRows items={option.ingredients.map((item) => displayIngredient(item, count / view.servings))} />
            </Card>
          );
        }),
      )}

      {steps.length > 0 ? <SectionTitle>Zubereitung</SectionTitle> : null}
      <View>
        {steps.map((step, index) => (
          <View key={step.id} style={styles.step}>
            <View style={styles.rail}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              {index < steps.length - 1 ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.stepBody}>
              {step.optionId ? <Tag icon="alt_route" label={`Nur ${optionNames.get(step.optionId)}`} tone={tones.green} /> : null}
              <Text style={styles.body}>{step.text}</Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  ingredients: { paddingVertical: spacing.sm, gap: spacing.xs },
  optionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs },
  optionName: { flex: 1, fontFamily: fonts.display, fontSize: 17, lineHeight: 23, color: colors.primary },
  optionCount: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  step: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 32 },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  stepNumberText: { fontFamily: fonts.display, fontSize: 16, lineHeight: 21, color: colors.accent },
  line: { flex: 1, width: 2, marginVertical: spacing.xs, borderRadius: 1, backgroundColor: colors.border },
  stepBody: { flex: 1, gap: spacing.xs + 2, paddingTop: 5, paddingBottom: spacing.lg },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
});
