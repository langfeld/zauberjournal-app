import {
  FOOD_CATEGORIES,
  FOOD_DIETS,
  isActive,
  listFoods,
  mergeFoods,
  updateFood,
  type FoodCategory,
  type FoodDiet,
  type FoodStock,
  type RowWrite,
} from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_STYLES } from '@/components/category-style';
import { Icon } from '@/components/icon';
import { NotFound } from '@/components/not-found';
import { Card, Chip, Hint, IconCircle, SearchField, SectionTitle, Segmented, TextField, type SegmentOption } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables } from '@/data/tables';
import { confirm } from '@/lib/confirm';
import { colors, radius, shadows, spacing } from '@/theme';

const DIETS: { id: FoodDiet; label: string }[] = [{ id: '', label: 'unbekannt' }, ...FOOD_DIETS];
const STOCKS: SegmentOption<FoodStock>[] = [
  { id: '', label: 'nicht im Vorrat' },
  { id: 'have', label: 'da' },
  { id: 'buy', label: 'nachkaufen', color: colors.accent },
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
  const style = CATEGORY_STYLES[food.category as FoodCategory] ?? CATEGORY_STYLES.other;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: food.name || 'Lebensmittel' }} />
      <Card style={styles.nameCard}>
        <IconCircle icon={style.icon} tone={style.tone} size={48} square />
        <TextField
          label="Name"
          value={food.name}
          onChangeText={(name) => write(updateFood(tables, id, { name }))}
          containerStyle={styles.grow}
        />
      </Card>

      <SectionTitle>Warengruppe</SectionTitle>
      <View style={styles.chips}>
        {FOOD_CATEGORIES.map((category) => (
          <Chip
            key={category.id}
            icon={CATEGORY_STYLES[category.id].icon}
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
            icon={diet.id === 'vegan' || diet.id === 'vegetarian' ? 'eco' : undefined}
            label={diet.label}
            selected={food.diet === diet.id}
            onPress={() => write(updateFood(tables, id, { diet: diet.id }))}
          />
        ))}
      </View>

      <SectionTitle>Vorrat</SectionTitle>
      <Segmented options={STOCKS} value={food.stock ?? ''} onChange={(stock) => write(updateFood(tables, id, { stock }))} />

      <SectionTitle>Dasselbe wie …</SectionTitle>
      <Hint>Wenn es dieses Lebensmittel doppelt gibt, z. B. „Lauchzwiebeln“ und „Frühlingszwiebeln“.</Hint>
      <SearchField
        accessibilityLabel="Lebensmittel zum Zusammenführen suchen"
        value={query}
        onChangeText={setQuery}
        placeholder="Anderes Lebensmittel suchen"
      />
      {others.map((other) => (
        <Pressable
          key={other.id}
          accessibilityRole="button"
          accessibilityLabel={`Mit ${other.name} zusammenführen`}
          onPress={() => void merge(other.id, other.name, Date.now())}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
          <Text style={styles.optionText}>{other.name}</Text>
          <Icon name="merge" size={20} color={colors.primary} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  nameCard: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  grow: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  pressed: { opacity: 0.8 },
  optionText: { flex: 1, fontSize: 16, color: colors.text },
});
