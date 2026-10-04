import { categoryLabel, FOOD_DIETS, listFoods } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { Hint } from '@/components/ui';
import { useAppTables } from '@/data/tables';
import { colors, radius, spacing } from '@/theme';

const STOCK_LABELS = { '': '', have: 'im Vorrat', buy: 'nachkaufen' } as const;

export default function FoodsScreen() {
  const tables = useAppTables();
  const [query, setQuery] = useState('');
  const foods = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de');
    return listFoods(tables).filter((food) => !needle || food.name.toLocaleLowerCase('de').includes(needle));
  }, [tables, query]);

  return (
    <FlatList
      data={foods}
      keyExtractor={(food) => food.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <>
          <Stack.Screen options={{ title: 'Lebensmittel' }} />
          <Hint>
            Lebensmittel entstehen von selbst aus den Zutaten der Rezepte. Hier lässt sich ändern, wo sie im Laden stehen,
            ob sie vegetarisch sind und welche Namen dasselbe meinen.
          </Hint>
          <TextInput
            accessibilityLabel="Lebensmittel suchen"
            value={query}
            onChangeText={setQuery}
            placeholder="Suchen"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/pantry/${encodeURIComponent(item.id)}`)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {[
              categoryLabel(item.category),
              FOOD_DIETS.find((diet) => diet.id === item.diet)?.label,
              STOCK_LABELS[item.stock],
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={<Hint>{query ? 'Nichts gefunden.' : 'Noch keine Lebensmittel.'}</Hint>}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm },
  input: {
    minHeight: 44,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  row: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
});
