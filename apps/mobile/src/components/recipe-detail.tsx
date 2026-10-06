import { buildRecipeView, formatDuration, planRecipeFavorite, resizeDistribution, shiftServing, type Distribution } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { applyWrites, useRecipeTables } from '@/data/recipes';
import { useStore } from '@/data/store';
import { colors, fonts, radius, spacing, tones } from '@/theme';

import { HeaderButton, HeaderFavorite, HeaderRight } from './header';
import { Icon } from './icon';
import { NotFound } from './not-found';
import { RecipeNutrition } from './nutrition';
import { RecipeBody } from './recipe-body';
import { RecipeCover } from './recipe-photo';
import { RecipePlanCard } from './recipe-plan-card';
import { Button, Card, Stepper, Tag } from './ui';

type RecipeDetailProps = {
  id: string;
  /** Nur ansehen, z. B. aus den Planvorschlägen: ohne Bearbeiten und Kochen, die gehören in den Rezepte-Tab. */
  preview?: boolean;
};

/** Ein Rezept mit Foto, Portionen, Zutaten, Schritten und Nährwerten. */
export function RecipeDetail({ id, preview }: RecipeDetailProps) {
  const store = useStore();
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
  const sourceIsLink = /^https?:\/\//i.test(view.source);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <HeaderRight>
              <HeaderFavorite
                favorite={view.favorite}
                onPress={() => store && applyWrites(store, planRecipeFavorite(view.id, !view.favorite))}
              />
              {preview ? null : (
                <HeaderButton icon="edit" title="Bearbeiten" onPress={() => router.push(`/recipes/${view.id}/edit`)} />
              )}
            </HeaderRight>
          ),
        }}
      />
      {view.photo ? <RecipeCover photoId={view.photo} title={view.title} aspectRatio={4 / 3} /> : null}
      <View style={[styles.content, view.photo ? styles.overlap : null]}>
        <Text style={styles.title}>{view.title}</Text>
        {view.prepMinutes || view.cookMinutes ? (
          <View style={styles.tags}>
            {view.prepMinutes ? (
              <Tag icon="timer" label={`Vorbereitung ${formatDuration(view.prepMinutes)}`} tone={tones.wheat} />
            ) : null}
            {view.cookMinutes ? (
              <Tag icon="skillet" label={`Koch-/Backzeit ${formatDuration(view.cookMinutes)}`} tone={tones.terracotta} />
            ) : null}
          </View>
        ) : null}
        {view.description ? <Text style={styles.description}>{view.description}</Text> : null}
        {/* Aus den Vorschlägen heraus geht es vor allem darum, ob das Rezept passt. */}
        {preview ? <RecipePlanCard view={view} /> : null}

        <Card>
          <Stepper
            icon="group"
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
        {preview ? null : (
          <Button
            icon="skillet"
            title="Kochen"
            onPress={() =>
              router.push({
                pathname: '/recipes/[id]/cook',
                params: { id: view.id, servings: String(total), distribution: JSON.stringify(current) },
              })
            }
          />
        )}

        <RecipeBody view={view} servings={total} distribution={current} />
        <RecipeNutrition recipeId={view.id} />
        {preview ? null : <RecipePlanCard view={view} />}

        {view.notes ? (
          <View style={styles.notes}>
            <View style={styles.notesTitle}>
              <Icon name="sticky_note_2" size={20} color={tones.ochre.foreground} />
              <Text style={styles.notesHeading}>Notizen</Text>
            </View>
            <Text style={styles.body}>{view.notes}</Text>
          </View>
        ) : null}
        {view.source ? (
          <Pressable
            accessibilityRole={sourceIsLink ? 'link' : undefined}
            disabled={!sourceIsLink}
            onPress={() => Linking.openURL(view.source)}
            style={styles.source}>
            <Icon name={sourceIsLink ? 'link' : 'menu_book'} size={18} color={sourceIsLink ? colors.primary : colors.textMuted} />
            <Text style={[styles.sourceText, sourceIsLink && styles.link]} numberOfLines={2}>
              Quelle: {view.source}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl * 2 },
  content: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  // Der Inhalt schiebt sich mit runden Ecken über das Foto.
  overlap: {
    marginTop: -radius.lg - 6,
    paddingTop: spacing.lg + 2,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    backgroundColor: colors.background,
  },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 37, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  description: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 25, color: colors.textMuted },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  group: { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  groupName: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  notes: {
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.paperBorder,
  },
  notesTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notesHeading: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.text },
  source: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  sourceText: { flex: 1, fontSize: 14, color: colors.textMuted },
  link: { color: colors.primary, textDecorationLine: 'underline' },
});
