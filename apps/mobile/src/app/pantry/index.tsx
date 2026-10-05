import { ensureFood, FOOD_CATEGORIES, listFoods, updateFood, type FoodStock, type RowWrite } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_STYLES } from '@/components/category-style';
import { HeaderButton, HeaderRight } from '@/components/header';
import { SyncBadge } from '@/components/sync-status';
import { AddField, Card, EmptyState, Hint, IconCircle, Segmented, Tag, type SegmentOption } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables } from '@/data/tables';
import { colors, fonts, spacing, tones } from '@/theme';

const STOCK_OPTIONS: SegmentOption<FoodStock>[] = [
  { id: 'have', label: 'Da' },
  { id: 'buy', label: 'Nachkaufen', color: colors.accent },
];

export default function PantryScreen() {
  const store = useStore();
  const tables = useAppTables();
  const [name, setName] = useState('');
  const stocked = useMemo(() => listFoods(tables).filter((food) => food.stock !== ''), [tables]);
  const toBuy = stocked.filter((food) => food.stock === 'buy').length;

  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };
  const setStock = (foodId: string, stock: FoodStock) => write(updateFood(tables, foodId, { stock }));
  const add = () => {
    const result = ensureFood(tables, name);
    if (!result) return;
    // Erst das Lebensmittel anlegen, dann den Vorrat setzen; beides in einem Schritt.
    write([...result.writes, { table: 'foods', rowId: result.foodId, cells: { stock: 'have' } }]);
    setName('');
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: 'Vorrat',
          headerRight: () => (
            <HeaderRight>
              <HeaderButton icon="category" title="Lebensmittel" onPress={() => router.push('/pantry/foods')} />
              <SyncBadge />
            </HeaderRight>
          ),
        }}
      />
      <Hint>
        Was ihr meistens daheim habt. Auf der Einkaufsliste stehen diese Dinge unter „Vorrat prüfen“; was auf
        „Nachkaufen“ steht, kommt von selbst auf die nächste Liste.
      </Hint>
      <AddField
        accessibilityLabel="Lebensmittel zum Vorrat hinzufügen"
        value={name}
        onChangeText={setName}
        onAdd={add}
        placeholder="Hinzufügen, z. B. Olivenöl"
      />
      {toBuy > 0 ? <Tag icon="add_shopping_cart" label={`${toBuy} zum Nachkaufen`} tone={tones.terracotta} /> : null}

      {stocked.length === 0 ? (
        <EmptyState icon="kitchen" title="Noch nichts im Vorrat">
          Trag ein, was ihr meistens daheim habt, z. B. Olivenöl, Reis oder Zwiebeln.
        </EmptyState>
      ) : null}
      {FOOD_CATEGORIES.map((category) => {
        const foods = stocked.filter((food) => food.category === category.id);
        if (foods.length === 0) return null;
        const style = CATEGORY_STYLES[category.id];
        return (
          <Card key={category.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconCircle icon={style.icon} tone={style.tone} size={34} square />
              <Text style={styles.sectionTitle}>{category.label}</Text>
            </View>
            {foods.map((food, index) => (
              <View key={food.id} style={[styles.row, index > 0 && styles.divider]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/pantry/${encodeURIComponent(food.id)}`)}
                  style={styles.name}>
                  <Text style={styles.foodName}>{food.name}</Text>
                </Pressable>
                <Segmented
                  small
                  options={STOCK_OPTIONS}
                  value={food.stock}
                  labelPrefix={`${food.name}: `}
                  onChange={(stock) => setStock(food.id, stock)}
                />
              </View>
            ))}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  section: { paddingVertical: spacing.md, gap: spacing.xs },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.xs },
  sectionTitle: { flex: 1, fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs + 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { flex: 1, paddingVertical: spacing.sm },
  foodName: { fontSize: 16, color: colors.text },
});
