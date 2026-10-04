import { formatDuration, listRecipes, type RecipeSummary } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecipePhoto } from '@/components/recipe-photo';
import { StatusDot, syncStatusText } from '@/components/sync-status';
import { Button } from '@/components/ui';
import { useConnection } from '@/data/connection';
import { useRecipeTables } from '@/data/recipes';
import { colors, radius, spacing } from '@/theme';

function describe(recipe: RecipeSummary): string {
  const parts = [`${recipe.servings} ${recipe.servings === 1 ? 'Portion' : 'Portionen'}`];
  if (recipe.totalMinutes !== null) parts.push(formatDuration(recipe.totalMinutes));
  if (recipe.optionNames.length > 0) parts.push(recipe.optionNames.join(' / '));
  return parts.join(' · ');
}

/** Platzhalter für Rezepte ohne Foto: der Anfangsbuchstabe des Titels. */
function Initial({ title }: { title: string }) {
  return (
    <View style={[styles.thumbnail, styles.initial]}>
      <Text style={styles.initialText}>{title.trim().charAt(0).toLocaleUpperCase('de') || '?'}</Text>
    </View>
  );
}

export default function RecipeListScreen() {
  const tables = useRecipeTables();
  const { status } = useConnection();
  const [query, setQuery] = useState('');
  const recipes = useMemo(() => listRecipes(tables, query), [tables, query]);
  const hasRecipes = Object.keys(tables.recipes).length > 0;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: 'Rezepte',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Haushalt: ${syncStatusText(status).label}`}
              onPress={() => router.push('/household')}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <StatusDot status={status} />
              <Text style={styles.headerButtonText}>Haushalt</Text>
            </Pressable>
          ),
        }}
      />
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
            <RecipePhoto photoId={item.photo} style={styles.thumbnail} alt="" fallback={<Initial title={item.title} />} />
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
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <View style={styles.footerButton}>
          <Button title="Importieren" onPress={() => router.push('/recipes/import')} />
        </View>
        <View style={styles.footerButton}>
          <Button variant="secondary" title="Selbst eingeben" onPress={() => router.push('/recipes/new')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  headerButtonText: { fontSize: 16, fontWeight: '600', color: colors.primary },
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
  thumbnail: { width: 64, height: 64, borderRadius: radius.sm },
  initial: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  initialText: { fontSize: 24, fontWeight: '700', color: colors.primary },
  pressed: { opacity: 0.7 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  footerButton: { flex: 1 },
});
