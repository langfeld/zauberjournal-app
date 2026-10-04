import {
  addManualItem,
  buildShoppingListView,
  checkShoppingItem,
  completeShoppingList,
  createId,
  createShoppingList,
  formatShortDate,
  listOpenShoppingLists,
  removeShoppingItem,
  syncShoppingList,
  updateFood,
  type RowWrite,
} from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ShoppingItemRow } from '@/components/shopping-item-row';
import { Button, Card, Chip, Hint, SectionTitle } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables, useToday } from '@/data/tables';
import { confirm } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

export default function ShoppingScreen() {
  const store = useStore();
  const tables = useAppTables();
  const today = useToday();
  const lists = useMemo(() => listOpenShoppingLists(tables), [tables]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newItem, setNewItem] = useState('');
  const listId = lists.find((list) => list.id === selected)?.id ?? lists[0]?.id;

  // Die Positionen folgen dem Plan: Ändern sich Gerichte, Portionen oder der Vorrat, passt sich die Liste an.
  useEffect(() => {
    if (!store || !listId) return;
    const writes = syncShoppingList(tables, listId, Date.now());
    if (writes.length > 0) applyWrites(store, writes);
  }, [store, tables, listId]);

  const view = useMemo(() => (listId ? buildShoppingListView(tables, listId) : undefined), [tables, listId]);

  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };

  if (!view) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Einkauf' }} />
        <Card>
          <Text style={styles.cardTitle}>Keine offene Einkaufsliste</Text>
          <Text style={styles.body}>
            Wähle geplante Gerichte aus; die Zutaten werden zusammengerechnet und nach Warengruppen sortiert.
          </Text>
          <Button title="Aus dem Plan erstellen" onPress={() => router.push('/shopping/entries')} />
          <Button
            variant="secondary"
            title="Leere Liste"
            onPress={() => write(createShoppingList(tables, [], today, Date.now(), createId).writes)}
          />
        </Card>
      </ScrollView>
    );
  }

  const addItem = () => {
    if (!newItem.trim()) return;
    write(addManualItem(tables, view.id, newItem, Date.now(), createId));
    setNewItem('');
  };
  const finish = async () => {
    const open = view.sections.reduce((sum, section) => sum + section.items.length, 0);
    const message = open > 0 ? `${open} Positionen sind noch nicht abgehakt.` : 'Die Liste wird abgeschlossen.';
    if (!(await confirm('Einkauf abschließen?', message, 'Abschließen'))) return;
    write(completeShoppingList(tables, view.id));
  };
  const toggle = (itemId: string, checked: boolean) => write(checkShoppingItem(tables, itemId, checked));

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: view.name }} />
      {lists.length > 1 ? (
        <View style={styles.chips}>
          {lists.map((list) => (
            <Chip key={list.id} label={list.name} selected={list.id === view.id} onPress={() => setSelected(list.id)} />
          ))}
        </View>
      ) : null}

      <View style={styles.addRow}>
        <TextInput
          accessibilityLabel="Artikel hinzufügen"
          value={newItem}
          onChangeText={setNewItem}
          placeholder="Hinzufügen, z. B. 2 l Milch"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={addItem}
          style={styles.input}
        />
        <Button small title="+" accessibilityLabel="Hinzufügen" disabled={!newItem.trim()} onPress={addItem} />
      </View>

      <View style={styles.entries}>
        <Text style={styles.meta}>
          {view.entries.length > 0
            ? `Für ${view.entries.map((entry) => `${entry.title} (${formatShortDate(entry.date)})`).join(', ')}`
            : 'Noch keine Gerichte auf der Liste.'}
        </Text>
        <Button
          small
          variant="ghost"
          title="Gerichte wählen"
          onPress={() => router.push({ pathname: '/shopping/entries', params: { list: view.id } })}
        />
      </View>

      {view.sections.map((section) => (
        <View key={section.category} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.label}</Text>
          {section.items.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              onToggle={() => toggle(item.id, true)}
              onRemove={item.origin === 'manual' ? () => write(removeShoppingItem(item.id, Date.now())) : undefined}
            />
          ))}
        </View>
      ))}
      {view.sections.length === 0 && view.pantry.length === 0 ? (
        <Hint>{view.done.length > 0 ? 'Alles abgehakt.' : 'Die Liste ist leer.'}</Hint>
      ) : null}

      {view.pantry.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vorrat prüfen</Text>
          <Hint>Laut Vorrat da. Abhaken, wenn genug da ist, sonst „Kaufen“.</Hint>
          {view.pantry.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              onToggle={() => toggle(item.id, true)}
              action={{ title: 'Kaufen', onPress: () => write(updateFood(tables, item.foodId, { stock: 'buy' })) }}
            />
          ))}
        </View>
      ) : null}

      {view.done.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Erledigt ({view.done.length})</Text>
          {view.done.map((item) => (
            <ShoppingItemRow key={item.id} item={item} onToggle={() => toggle(item.id, false)} />
          ))}
        </View>
      ) : null}

      <SectionTitle>Fertig?</SectionTitle>
      <Button variant="secondary" title="Einkauf abschließen" onPress={() => void finish()} />
      <Hint>Danach gelten die Gerichte im Plan als eingekauft, und die nächste Liste fängt leer an.</Hint>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, lineHeight: 21, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
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
  entries: { gap: spacing.xs, alignItems: 'flex-start' },
  meta: { fontSize: 14, color: colors.textMuted },
  section: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: spacing.xs },
});
