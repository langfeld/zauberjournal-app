import { buildRecipeView, formatDuration, resizeDistribution, shiftServing, type Distribution } from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { NotFound } from '@/components/not-found';
import { RecipeBody } from '@/components/recipe-body';
import { RecipePhoto } from '@/components/recipe-photo';
import { Button, Card, SectionTitle, Stepper } from '@/components/ui';
import { useRecipeTables } from '@/data/recipes';
import { colors, radius, spacing } from '@/theme';

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
      <RecipePhoto photoId={view.photo} style={styles.photo} alt={`Foto: ${view.title}`} />
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

      <RecipeBody view={view} servings={total} distribution={current} />

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
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  group: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  groupName: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
});
