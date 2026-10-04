import {
  buildRecipeView,
  displayIngredient,
  formatDuration,
  resizeDistribution,
  shiftServing,
  type Distribution,
} from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IngredientRows } from '@/components/ingredient-rows';
import { NotFound } from '@/components/not-found';
import { Button, Card, SectionTitle, Stepper } from '@/components/ui';
import { useRecipeTables } from '@/data/recipes';
import { colors, radius, spacing } from '@/theme';

function portions(count: number): string {
  return `${count} ${count === 1 ? 'Portion' : 'Portionen'}`;
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tables = useRecipeTables();
  const view = useMemo(() => buildRecipeView(tables, id), [tables, id]);
  const [servings, setServings] = useState<number | null>(null);
  const [distribution, setDistribution] = useState<Distribution>({});

  if (!view) return <NotFound />;

  const total = servings ?? view.servings;
  const current = resizeDistribution(distribution, view.groups, total);
  const changeServings = (next: number) => {
    setServings(next);
    setDistribution(resizeDistribution(current, view.groups, next));
  };

  const optionServings = new Map<string, number>();
  const optionNames = new Map<string, string>();
  for (const group of view.groups) {
    for (const option of group.options) {
      optionServings.set(option.id, current[group.id]?.[option.id] ?? 0);
      optionNames.set(option.id, option.name);
    }
  }
  const steps = view.steps.filter((step) => !step.optionId || (optionServings.get(step.optionId) ?? 0) > 0);
  const times = [
    view.prepMinutes ? `Vorbereitung ${formatDuration(view.prepMinutes)}` : null,
    view.cookMinutes ? `Koch-/Backzeit ${formatDuration(view.cookMinutes)}` : null,
  ].filter(Boolean);
  const sourceIsLink = /^https?:\/\//i.test(view.source);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Button small variant="ghost" title="Bearbeiten" onPress={() => router.push(`/recipes/${view.id}/edit`)} />
          ),
        }}
      />
      <Text style={styles.title}>{view.title}</Text>
      {times.length > 0 ? <Text style={styles.meta}>{times.join(' · ')}</Text> : null}
      {view.description ? <Text style={styles.body}>{view.description}</Text> : null}

      <Card>
        <Stepper
          label="Portionen"
          value={total}
          canDecrease={total > 1}
          onDecrease={() => changeServings(total - 1)}
          onIncrease={() => changeServings(total + 1)}
        />
        {view.groups.map((group) => (
          <View key={group.id} style={styles.group}>
            <Text style={styles.groupName}>{group.name}</Text>
            {group.options.map((option) => {
              const count = current[group.id]?.[option.id] ?? 0;
              return (
                <Stepper
                  key={option.id}
                  label={option.name}
                  value={count}
                  canDecrease={count > 0 && group.options.length > 1}
                  canIncrease={count < total}
                  onDecrease={() => setDistribution(shiftServing(current, group, option.id, -1))}
                  onIncrease={() => setDistribution(shiftServing(current, group, option.id, 1))}
                />
              );
            })}
          </View>
        ))}
      </Card>

      <SectionTitle>Zutaten</SectionTitle>
      <IngredientRows items={view.ingredients.map((item) => displayIngredient(item, total / view.servings))} />
      {view.groups.map((group) =>
        group.options.map((option) => {
          const count = optionServings.get(option.id) ?? 0;
          if (count === 0) return null;
          return (
            <View key={option.id} style={styles.optionBlock}>
              <Text style={styles.optionTitle}>
                {option.name} · {portions(count)}
              </Text>
              <IngredientRows
                items={option.ingredients.map((item) => displayIngredient(item, count / view.servings))}
              />
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

      {view.notes ? (
        <>
          <SectionTitle>Notizen</SectionTitle>
          <Text style={styles.body}>{view.notes}</Text>
        </>
      ) : null}
      {view.source ? (
        <Text
          style={[styles.meta, sourceIsLink && styles.link]}
          onPress={sourceIsLink ? () => Linking.openURL(view.source) : undefined}>
          Quelle: {view.source}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  group: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  groupName: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
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
