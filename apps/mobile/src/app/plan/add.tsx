import {
  createId,
  formatDate,
  isDateKey,
  listRecipes,
  MEAL_IDS,
  planAddEntry,
  type MealId,
} from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { MEAL_ICONS } from '@/components/category-style';
import { Icon } from '@/components/icon';
import { RecipeThumbnail } from '@/components/recipe-photo';
import { AddField, Chip, EmptyState, SearchField, SectionTitle } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useActiveMeals, useAppTables, useToday } from '@/data/tables';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

export default function AddPlanEntryScreen() {
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const store = useStore();
  const tables = useAppTables();
  const meals = useActiveMeals();
  const today = useToday();
  const date = params.date && isDateKey(params.date) ? params.date : today;
  const [meal, setMeal] = useState<MealId>(
    MEAL_IDS.includes(params.meal as MealId) ? (params.meal as MealId) : 'dinner',
  );
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const recipes = useMemo(() => listRecipes(tables, query), [tables, query]);

  const add = (recipeId: string, entryText = '') => {
    if (!store) return;
    applyWrites(store, planAddEntry(tables, { date, meal, recipeId, text: entryText }, Date.now(), createId).writes);
    router.back();
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: formatDate(date) }} />
      <FlatList
        data={recipes}
        keyExtractor={(recipe) => recipe.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            {meals.length > 1 ? (
              <View style={styles.chips}>
                {meals.map((option) => (
                  <Chip
                    key={option.id}
                    icon={MEAL_ICONS[option.id]}
                    label={option.label}
                    selected={meal === option.id}
                    onPress={() => setMeal(option.id)}
                  />
                ))}
              </View>
            ) : null}
            <AddField
              accessibilityLabel="Eintrag ohne Rezept"
              value={text}
              onChangeText={setText}
              onAdd={() => text.trim() && add('', text)}
              placeholder="Ohne Rezept, z. B. Reste"
            />
            <SectionTitle>Rezept wählen</SectionTitle>
            <SearchField accessibilityLabel="Rezepte durchsuchen" value={query} onChangeText={setQuery} placeholder="Rezept suchen" />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} einplanen`}
            onPress={() => add(item.id)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <RecipeThumbnail photoId={item.photo} title={item.title} size={52} />
            <View style={styles.cardText}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              {item.optionNames.length > 0 ? <Text style={styles.meta}>{item.optionNames.join(' / ')}</Text> : null}
            </View>
            <View style={styles.addIcon}>
              <Icon name="add" size={20} color={colors.primary} />
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          query ? (
            <EmptyState icon="search" title="Kein Rezept gefunden" />
          ) : (
            <EmptyState icon="menu_book" title="Noch keine Rezepte">
              Unter „Rezepte“ lassen sich welche importieren oder selbst eingeben.
            </EmptyState>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.sm + 2, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  cardText: { flex: 1, gap: 3 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  title: { fontFamily: fonts.display, fontSize: 16.5, lineHeight: 21, color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  addIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
});
