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
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { RecipeThumbnail } from '@/components/recipe-photo';
import { Button, Chip, Hint } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useActiveMeals, useAppTables, useToday } from '@/data/tables';
import { colors, radius, spacing } from '@/theme';

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
                  <Chip key={option.id} label={option.label} selected={meal === option.id} onPress={() => setMeal(option.id)} />
                ))}
              </View>
            ) : null}
            <View style={styles.freeText}>
              <TextInput
                accessibilityLabel="Eintrag ohne Rezept"
                value={text}
                onChangeText={setText}
                placeholder="Ohne Rezept, z. B. Reste"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={() => text.trim() && add('', text)}
                style={[styles.input, styles.grow]}
              />
              <Button small title="Eintragen" disabled={!text.trim()} onPress={() => add('', text)} />
            </View>
            <TextInput
              accessibilityLabel="Rezepte durchsuchen"
              value={query}
              onChangeText={setQuery}
              placeholder="Rezept suchen"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} einplanen`}
            onPress={() => add(item.id)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <RecipeThumbnail photoId={item.photo} title={item.title} size={48} />
            <View style={styles.cardText}>
              <Text style={styles.title}>{item.title}</Text>
              {item.optionNames.length > 0 ? <Text style={styles.meta}>{item.optionNames.join(' / ')}</Text> : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Hint>{query ? 'Kein Rezept gefunden.' : 'Noch keine Rezepte vorhanden.'}</Hint>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  freeText: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
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
  cardText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
});
