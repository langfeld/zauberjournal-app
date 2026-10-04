import { ensureFood, FOOD_CATEGORIES, listFoods, updateFood, type FoodStock, type RowWrite } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, Hint } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables } from '@/data/tables';
import { colors, radius, spacing } from '@/theme';

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
            <Button small variant="ghost" title="Lebensmittel" onPress={() => router.push('/pantry/foods')} />
          ),
        }}
      />
      <Hint>
        Was ihr meistens daheim habt. Auf der Einkaufsliste stehen diese Dinge unter „Vorrat prüfen“; was auf
        „Nachkaufen“ steht, kommt von selbst auf die nächste Liste.
      </Hint>
      <View style={styles.addRow}>
        <TextInput
          accessibilityLabel="Lebensmittel zum Vorrat hinzufügen"
          value={name}
          onChangeText={setName}
          placeholder="Hinzufügen, z. B. Olivenöl"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={add}
          style={styles.input}
        />
        <Button small title="+" accessibilityLabel="Hinzufügen" disabled={!name.trim()} onPress={add} />
      </View>
      {toBuy > 0 ? <Text style={styles.meta}>{toBuy} zum Nachkaufen</Text> : null}

      {stocked.length === 0 ? <Hint>Noch nichts im Vorrat.</Hint> : null}
      {FOOD_CATEGORIES.map((category) => {
        const foods = stocked.filter((food) => food.category === category.id);
        if (foods.length === 0) return null;
        return (
          <View key={category.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{category.label}</Text>
            {foods.map((food) => (
              <View key={food.id} style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/pantry/${encodeURIComponent(food.id)}`)}
                  style={styles.name}>
                  <Text style={styles.foodName}>{food.name}</Text>
                </Pressable>
                <Chip label="Da" selected={food.stock === 'have'} onPress={() => setStock(food.id, 'have')} />
                <Chip label="Nachkaufen" selected={food.stock === 'buy'} onPress={() => setStock(food.id, 'buy')} />
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  meta: { fontSize: 14, color: colors.textMuted },
  section: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 2 },
  name: { flex: 1, paddingVertical: spacing.xs },
  foodName: { fontSize: 16, color: colors.text },
});
