import {
  addToPantry,
  createId,
  FOOD_CATEGORIES,
  formatStock,
  pantryOverview,
  updateFood,
  type FoodStock,
  type PantryEntry,
  type RowWrite,
} from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_STYLES } from '@/components/category-style';
import { HeaderButton, HeaderRight } from '@/components/header';
import { Icon } from '@/components/icon';
import { SyncBadge } from '@/components/sync-status';
import { AddField, Card, EmptyState, Hint, IconCircle, Segmented, Tag, type SegmentOption } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables, useToday } from '@/data/tables';
import { colors, fonts, spacing, tones } from '@/theme';

const STOCK_OPTIONS: SegmentOption<FoodStock>[] = [
  { id: 'have', label: 'Da' },
  { id: 'buy', label: 'Nachkaufen', color: colors.accent },
];

/** Wie lange ein Rest von Frischem noch zählt. */
function freshness(daysLeft: number | null): string {
  if (daysLeft === null) return '';
  if (daysLeft <= 0) return 'nur noch heute';
  return daysLeft === 1 ? 'noch 1 Tag' : `noch ${daysLeft} Tage`;
}

function EntryState({ entry, onStock }: { entry: PantryEntry; onStock: (stock: FoodStock) => void }) {
  // Ohne Menge: „immer im Haus“ wie bisher mit „da“ und „nachkaufen“.
  if (entry.level === null || entry.unit === null) {
    return <Segmented small options={STOCK_OPTIONS} value={entry.stock} labelPrefix={`${entry.name}: `} onChange={onStock} />;
  }
  const fresh = freshness(entry.daysLeft);
  return (
    <View style={styles.level}>
      <Text style={[styles.levelText, entry.empty && styles.levelEmpty]}>{entry.empty ? 'leer' : formatStock(entry.level, entry.unit)}</Text>
      {entry.empty ? <Text style={styles.levelNote}>kommt auf die Liste</Text> : fresh ? <Text style={styles.levelNote}>{fresh}</Text> : null}
    </View>
  );
}

export default function PantryScreen() {
  const store = useStore();
  const tables = useAppTables();
  const today = useToday();
  const [text, setText] = useState('');
  const entries = useMemo(() => pantryOverview(tables, today), [tables, today]);
  const toBuy = entries.filter((entry) => entry.empty).length;

  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };
  const add = (now: number) => {
    const result = addToPantry(tables, text, now, createId);
    if (!result) return;
    write(result.writes);
    setText('');
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
        Was ihr daheim habt: Gekauftes kommt beim Abschließen der Einkaufsliste dazu, Gekochtes geht ab, Frisches läuft
        nach ein paar Tagen ab. Was immer im Haus sein soll (Haus-Symbol), kommt auf die Liste, sobald es leer ist.
      </Hint>
      <AddField
        accessibilityLabel="Zum Vorrat hinzufügen"
        value={text}
        onChangeText={setText}
        onAdd={() => add(Date.now())}
        placeholder="Hinzufügen, z. B. 1 kg Reis oder Salz"
      />
      {toBuy > 0 ? <Tag icon="add_shopping_cart" label={`${toBuy} zum Nachkaufen`} tone={tones.terracotta} /> : null}

      {entries.length === 0 ? (
        <EmptyState icon="kitchen" title="Noch nichts im Vorrat">
          Nach dem nächsten Einkauf steht hier, was ihr gekauft habt. Was immer im Haus sein soll, z. B. Salz oder Öl, könnt
          ihr oben eintragen.
        </EmptyState>
      ) : null}
      {FOOD_CATEGORIES.map((category) => {
        const foods = entries.filter((entry) => entry.category === category.id);
        if (foods.length === 0) return null;
        const style = CATEGORY_STYLES[category.id];
        return (
          <Card key={category.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconCircle icon={style.icon} tone={style.tone} size={34} square />
              <Text style={styles.sectionTitle}>{category.label}</Text>
            </View>
            {foods.map((entry, index) => (
              <View key={entry.foodId} style={[styles.row, index > 0 && styles.divider]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.name}${entry.staple ? ', immer im Haus' : ''}`}
                  onPress={() => router.push(`/pantry/${encodeURIComponent(entry.foodId)}`)}
                  style={styles.name}>
                  <Text style={styles.foodName}>{entry.name}</Text>
                  {entry.staple ? <Icon name="home" size={15} color={colors.textMuted} /> : null}
                </Pressable>
                <EntryState entry={entry} onStock={(stock) => write(updateFood(tables, entry.foodId, { stock }))} />
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
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, paddingVertical: spacing.sm },
  foodName: { flexShrink: 1, fontSize: 16, color: colors.text },
  level: { alignItems: 'flex-end', paddingVertical: spacing.xs },
  levelText: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  levelEmpty: { color: colors.accent },
  levelNote: { fontSize: 12.5, color: colors.textMuted },
});
