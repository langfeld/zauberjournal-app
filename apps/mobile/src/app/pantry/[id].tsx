import {
  FOOD_CATEGORIES,
  FOOD_DIETS,
  isActive,
  listFoods,
  mergeFoods,
  updateFood,
  type FoodDiet,
  type FoodStock,
  type RowWrite,
} from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { NotFound } from '@/components/not-found';
import { Chip, Hint, SectionTitle, TextField } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables } from '@/data/tables';
import { confirm } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

const DIETS: { id: FoodDiet; label: string }[] = [{ id: '', label: 'unbekannt' }, ...FOOD_DIETS];
const STOCKS: { id: FoodStock; label: string }[] = [
  { id: '', label: 'nicht im Vorrat' },
  { id: 'have', label: 'da' },
  { id: 'buy', label: 'nachkaufen' },
];

export default function FoodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const tables = useAppTables();
  const [query, setQuery] = useState('');
  const food = tables.foods[id];
  const others = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de');
    if (!needle) return [];
    return listFoods(tables)
      .filter((other) => other.id !== id && other.name.toLocaleLowerCase('de').includes(needle))
      .slice(0, 8);
  }, [tables, id, query]);

  if (!food || !isActive(food)) {
    return <NotFound message="Dieses Lebensmittel gibt es nicht (mehr)." backLabel="Zum Vorrat" href="/pantry" />;
  }

  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };
  const merge = async (intoId: string, intoName: string, now: number) => {
    const message = `„${food.name}“ und „${intoName}“ werden ein Lebensmittel. Zutaten mit dem Namen „${food.name}“ zählen danach zu „${intoName}“.`;
    if (!(await confirm('Zusammenführen?', message, 'Zusammenführen'))) return;
    write(mergeFoods(tables, id, intoId, now));
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: food.name || 'Lebensmittel' }} />
      <TextField label="Name" value={food.name} onChangeText={(name) => write(updateFood(tables, id, { name }))} />

      <SectionTitle>Warengruppe</SectionTitle>
      <View style={styles.chips}>
        {FOOD_CATEGORIES.map((category) => (
          <Chip
            key={category.id}
            label={category.label}
            selected={food.category === category.id}
            onPress={() => write(updateFood(tables, id, { category: category.id }))}
          />
        ))}
      </View>

      <SectionTitle>Ernährung</SectionTitle>
      <Hint>Bestimmt, welche Option eine vegetarische Person im Plan automatisch bekommt.</Hint>
      <View style={styles.chips}>
        {DIETS.map((diet) => (
          <Chip
            key={diet.id || 'unknown'}
            label={diet.label}
            selected={food.diet === diet.id}
            onPress={() => write(updateFood(tables, id, { diet: diet.id }))}
          />
        ))}
      </View>

      <SectionTitle>Vorrat</SectionTitle>
      <View style={styles.chips}>
        {STOCKS.map((stock) => (
          <Chip
            key={stock.id || 'none'}
            label={stock.label}
            selected={(food.stock ?? '') === stock.id}
            onPress={() => write(updateFood(tables, id, { stock: stock.id }))}
          />
        ))}
      </View>

      <SectionTitle>Dasselbe wie …</SectionTitle>
      <Hint>Wenn es dieses Lebensmittel doppelt gibt, z. B. „Lauchzwiebeln“ und „Frühlingszwiebeln“.</Hint>
      <TextInput
        accessibilityLabel="Lebensmittel zum Zusammenführen suchen"
        value={query}
        onChangeText={setQuery}
        placeholder="Anderes Lebensmittel suchen"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      {others.map((other) => (
        <Pressable
          key={other.id}
          accessibilityRole="button"
          accessibilityLabel={`Mit ${other.name} zusammenführen`}
          onPress={() => void merge(other.id, other.name, Date.now())}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
          <Text style={styles.optionText}>{other.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
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
  option: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  optionText: { fontSize: 16, color: colors.text },
});
