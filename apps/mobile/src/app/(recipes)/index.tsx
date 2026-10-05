import { formatDuration, listRecipes, type RecipeSummary } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icon';
import { RecipeCover } from '@/components/recipe-photo';
import { Button, EmptyState, SearchField } from '@/components/ui';
import { useRecipeTables } from '@/data/recipes';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

/** Mindestbreite einer Karte; auf breiten Bildschirmen passen mehr Spalten nebeneinander. */
const MIN_CARD_WIDTH = 160;

function RecipeCard({ recipe, width }: { recipe: RecipeSummary; width: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/recipes/${recipe.id}`)}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}>
      <RecipeCover photoId={recipe.photo} title={recipe.title} />
      <View style={styles.cardText}>
        <Text style={styles.title} numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={styles.metaRow}>
          {recipe.totalMinutes !== null ? (
            <View style={styles.meta}>
              <Icon name="schedule" size={15} color={colors.textMuted} />
              <Text style={styles.metaText}>{formatDuration(recipe.totalMinutes)}</Text>
            </View>
          ) : null}
          <View style={styles.meta}>
            <Icon name="group" size={15} color={colors.textMuted} />
            <Text style={styles.metaText}>{recipe.servings}</Text>
          </View>
        </View>
        {recipe.optionNames.length > 0 ? (
          <View style={styles.meta}>
            <Icon name="alt_route" size={15} color={colors.primary} />
            <Text style={[styles.metaText, styles.options]} numberOfLines={1}>
              {recipe.optionNames.join(' / ')}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function RecipeListScreen() {
  const tables = useRecipeTables();
  const [query, setQuery] = useState('');
  const recipes = useMemo(() => listRecipes(tables, query), [tables, query]);
  const hasRecipes = Object.keys(tables.recipes).length > 0;
  const { width } = useWindowDimensions();
  const columns = Math.max(2, Math.floor((width - spacing.lg * 2 + spacing.md) / (MIN_CARD_WIDTH + spacing.md)));
  const cardWidth = (width - spacing.lg * 2 - spacing.md * (columns - 1)) / columns;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Rezepte' }} />
      <FlatList
        key={columns}
        data={recipes}
        numColumns={columns}
        keyExtractor={(recipe) => recipe.id}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          hasRecipes ? (
            <View style={styles.header}>
              <SearchField
                accessibilityLabel="Rezepte durchsuchen"
                value={query}
                onChangeText={setQuery}
                placeholder="Suchen nach Titel oder Zutat"
              />
              <Text style={styles.count}>
                {query ? `${recipes.length} Treffer` : `${recipes.length} ${recipes.length === 1 ? 'Rezept' : 'Rezepte'}`}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => <RecipeCard recipe={item} width={cardWidth} />}
        ListEmptyComponent={
          hasRecipes && query ? (
            <EmptyState icon="search" title="Nichts gefunden">
              Versuch es mit einem anderen Suchbegriff.
            </EmptyState>
          ) : (
            <EmptyState icon="menu_book" title="Noch keine Rezepte">
              Importier ein Rezept aus Foto, Link oder Text, oder gib eins selbst ein.
            </EmptyState>
          )
        }
      />
      <View style={styles.footer}>
        <View style={styles.footerButton}>
          <Button icon="auto_awesome" title="Importieren" onPress={() => router.push('/recipes/import')} />
        </View>
        <View style={styles.footerButton}>
          <Button variant="secondary" title="Selbst eingeben" onPress={() => router.push('/recipes/new')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
  row: { gap: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  count: { fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.3 },
  card: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  cardText: { padding: spacing.md, paddingTop: spacing.sm + 2, gap: spacing.xs + 2 },
  title: { fontFamily: fonts.display, fontSize: 16.5, lineHeight: 21, color: colors.text },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: colors.textMuted },
  options: { flexShrink: 1, color: colors.primary, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButton: { flex: 1 },
});
