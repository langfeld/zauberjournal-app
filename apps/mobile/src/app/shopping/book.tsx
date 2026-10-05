import {
  bookPurchase,
  completeShoppingList,
  formatNumber,
  parseStockAmount,
  purchaseSuggestions,
  unitLabel,
  type PurchaseSuggestion,
  type RowWrite,
} from '@zauberjournal/core';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Button, Card, Hint } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables } from '@/data/tables';
import { colors, radius, spacing } from '@/theme';

type Draft = { amount: string; selected: boolean };

function BookingRow({
  suggestion,
  draft,
  divider,
  onChange,
}: {
  suggestion: PurchaseSuggestion;
  draft: Draft;
  divider: boolean;
  onChange: (draft: Draft) => void;
}) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: draft.selected }}
        accessibilityLabel={`${suggestion.name} einbuchen`}
        onPress={() => onChange({ ...draft, selected: !draft.selected })}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={[styles.box, draft.selected && styles.boxChecked]}>
          {draft.selected ? <Icon name="check" size={16} color={colors.primaryText} /> : null}
        </View>
        <Text style={[styles.name, !draft.selected && styles.muted]}>{suggestion.name}</Text>
      </Pressable>
      <TextInput
        accessibilityLabel={`Menge ${suggestion.name} in ${unitLabel(suggestion.unit, true)}`}
        value={draft.amount}
        // Wer eine Menge einträgt, will sie auch buchen.
        onChangeText={(amount) => onChange({ amount, selected: (parseStockAmount(amount) ?? 0) > 0 })}
        keyboardType="decimal-pad"
        placeholder="Menge"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <Text style={styles.unit}>{unitLabel(suggestion.unit, true)}</Text>
    </View>
  );
}

/** Nach dem Einkauf: das Gekaufte in den Vorrat buchen, dann die Liste abschließen. */
export default function BookPurchaseScreen() {
  const { list: listId = '' } = useLocalSearchParams<{ list?: string }>();
  const store = useStore();
  const tables = useAppTables();
  const suggestions = useMemo(() => purchaseSuggestions(tables, listId), [tables, listId]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  // Nach dem Abschließen geht es zurück; bis dahin nicht noch einmal umleiten.
  const [finished, setFinished] = useState(false);

  const list = tables.shoppingLists[listId];
  if (!list || (list.status !== 'open' && !finished)) return <Redirect href="/shopping" />;

  const draftOf = (suggestion: PurchaseSuggestion): Draft =>
    drafts[suggestion.foodId] ?? {
      amount: suggestion.amount === null ? '' : formatNumber(suggestion.amount, 'decimal'),
      selected: suggestion.selected,
    };
  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };
  const entries = suggestions.flatMap((suggestion) => {
    const draft = draftOf(suggestion);
    const amount = parseStockAmount(draft.amount);
    return draft.selected && amount ? [{ foodId: suggestion.foodId, amount, unit: suggestion.unit }] : [];
  });
  const finish = (book: boolean, now: number) => {
    setFinished(true);
    write([...bookPurchase(tables, listId, book ? entries : [], now), ...completeShoppingList(tables, listId)]);
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'In den Vorrat buchen' }} />
      <Hint>
        Das kommt in den Vorrat, mit den Mengen aus den REWE-Packungen oder der Liste. Passt etwas nicht, ändert die
        Menge oder wählt es ab.
      </Hint>
      <Button
        icon="inventory_2"
        title="Einbuchen und abschließen"
        disabled={entries.length === 0}
        onPress={() => finish(true, Date.now())}
      />
      <Card style={styles.list}>
        {suggestions.map((suggestion, index) => (
          <BookingRow
            key={suggestion.foodId}
            suggestion={suggestion}
            draft={draftOf(suggestion)}
            divider={index > 0}
            onChange={(draft) => setDrafts((previous) => ({ ...previous, [suggestion.foodId]: draft }))}
          />
        ))}
      </Card>
      <Button variant="ghost" title="Ohne Einbuchen abschließen" onPress={() => finish(false, Date.now())} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  list: { paddingVertical: spacing.xs, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  pressed: { opacity: 0.6 },
  box: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.primary },
  name: { flex: 1, fontSize: 16, color: colors.text },
  muted: { color: colors.textMuted },
  input: {
    width: 84,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  unit: { width: 44, fontSize: 14, color: colors.textMuted },
});
