import { formatDuration, listRecipes, type RecipeSummary } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { RecipeThumbnail } from '@/components/recipe-photo';
import { Button } from '@/components/ui';
import { useRecipeTables } from '@/data/recipes';
import { colors, radius, spacing } from '@/theme';

function describe(recipe: RecipeSummary): string {
  const parts = [`${recipe.servings} ${recipe.servings === 1 ? 'Portion' : 'Portionen'}`];
  if (recipe.totalMinutes !== null) parts.push(formatDuration(recipe.totalMinutes));
  if (recipe.optionNames.length > 0) parts.push(recipe.optionNames.join(' / '));
  return parts.join(' · ');
}

export default function RecipeListScreen() {
  const tables = useRecipeTables();
  const [query, setQuery] = useState('');
  const recipes = useMemo(() => listRecipes(tables, query), [tables, query]);
  const hasRecipes = Object.keys(tables.recipes).length > 0;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Rezepte' }} />
      <View style={styles.search}>
        <TextInput
          accessibilityLabel="Rezepte durchsuchen"
          value={query}
          onChangeText={setQuery}
          placeholder="Suchen nach Titel oder Zutat"
          placeholderTextColor={colors.textMuted}
          clearButtonMode="while-editing"
          style={styles.searchInput}
        />
      </View>
      <FlatList
        data={recipes}
        keyExtractor={(recipe) => recipe.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/recipes/${item.id}`)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <RecipeThumbnail photoId={item.photo} title={item.title} />
            <View style={styles.cardText}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>{describe(item)}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{hasRecipes && query ? 'Nichts gefunden' : 'Noch keine Rezepte'}</Text>
            <Text style={styles.meta}>
              {hasRecipes && query
                ? 'Versuch es mit einem anderen Suchbegriff.'
                : 'Importier ein Rezept aus Foto, Link oder Text, oder gib eins selbst ein.'}
            </Text>
          </View>
        }
      />
      <View style={styles.footer}>
        <View style={styles.footerButton}>
          <Button title="Importieren" onPress={() => router.push('/recipes/import')} />
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
  search: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  searchInput: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  list: { padding: spacing.lg, gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardText: { flex: 1, gap: spacing.xs },
  pressed: { opacity: 0.7 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  footerButton: { flex: 1 },
});
