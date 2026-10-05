import { categoryLabel, FOOD_DIETS, formatStock, listFoods, stockLevels } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_STYLES } from '@/components/category-style';
import { Icon } from '@/components/icon';
import { EmptyState, Hint, IconCircle, SearchField } from '@/components/ui';
import { useAppTables, useToday } from '@/data/tables';
import { colors, radius, shadows, spacing } from '@/theme';

const STOCK_LABELS = { '': '', have: 'immer im Haus', buy: 'nachkaufen' } as const;

export default function FoodsScreen() {
  const tables = useAppTables();
  const today = useToday();
  const [query, setQuery] = useState('');
  const foods = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de');
    return listFoods(tables).filter((food) => !needle || food.name.toLocaleLowerCase('de').includes(needle));
  }, [tables, query]);
  const levels = useMemo(() => stockLevels(tables, today), [tables, today]);

  return (
    <FlatList
      data={foods}
      keyExtractor={(food) => food.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <Stack.Screen options={{ title: 'Lebensmittel' }} />
          <Hint>
            Lebensmittel entstehen von selbst aus den Zutaten der Rezepte. Hier lässt sich ändern, wo sie im Laden stehen,
            ob sie vegetarisch sind und welche Namen dasselbe meinen.
          </Hint>
          <SearchField accessibilityLabel="Lebensmittel suchen" value={query} onChangeText={setQuery} placeholder="Suchen" />
        </View>
      }
      renderItem={({ item }) => {
        const style = CATEGORY_STYLES[item.category];
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/pantry/${encodeURIComponent(item.id)}`)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <IconCircle icon={style.icon} tone={style.tone} size={36} square />
            <View style={styles.text}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {[
                  categoryLabel(item.category),
                  FOOD_DIETS.find((diet) => diet.id === item.diet)?.label,
                  item.stockUnit && (levels.get(item.id) ?? 0) > 0 ? `${formatStock(levels.get(item.id) ?? 0, item.stockUnit)} im Vorrat` : '',
                  STOCK_LABELS[item.stock],
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Icon name="chevron_right" size={20} color={colors.borderStrong} />
          </Pressable>
        );
      }}
      ListEmptyComponent={
        query ? (
          <EmptyState icon="search" title="Nichts gefunden" />
        ) : (
          <EmptyState icon="category" title="Noch keine Lebensmittel" />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  row: {
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
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
});
