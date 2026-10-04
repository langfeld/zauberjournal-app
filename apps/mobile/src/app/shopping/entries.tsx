import {
  addDays,
  createDietLookup,
  createId,
  createShoppingList,
  describePlanEntry,
  formatShortDate,
  isActive,
  listPlanEntries,
  setShoppingListEntries,
  type PlanEntryView,
} from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Hint } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables, useToday } from '@/data/tables';
import { colors, radius, spacing } from '@/theme';

/** So weit voraus werden geplante Gerichte angeboten. */
const DAYS_AHEAD = 28;

export default function ShoppingEntriesScreen() {
  const { list } = useLocalSearchParams<{ list?: string }>();
  const store = useStore();
  const tables = useAppTables();
  const today = useToday();
  const listId = list && tables.shoppingLists[list] && isActive(tables.shoppingLists[list]!) ? list : null;

  const entries = useMemo(() => {
    const dietOf = createDietLookup(tables);
    const upcoming = listPlanEntries(tables, today, addDays(today, DAYS_AHEAD - 1), dietOf);
    const onList = listId ? listPlanEntries(tables, '0000-00-00', '9999-12-31', dietOf).filter((entry) => entry.shoppingListId === listId) : [];
    const all = new Map([...onList, ...upcoming].map((entry) => [entry.id, entry]));
    return [...all.values()]
      .filter((entry) => entry.recipe && (entry.status !== 'cooked' || entry.shoppingListId === listId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  }, [tables, today, listId]);

  const openLists = useMemo(
    () =>
      new Set(
        Object.entries(tables.shoppingLists)
          .filter(([, row]) => isActive(row) && row.status === 'open')
          .map(([id]) => id),
      ),
    [tables],
  );

  // Vorauswahl: bei einer bestehenden Liste ihre Gerichte, sonst alles, was noch auf keiner offenen Liste steht.
  const [selected, setSelected] = useState(
    () =>
      new Set(
        entries
          .filter((entry) =>
            listId ? entry.shoppingListId === listId : !openLists.has(entry.shoppingListId) && entry.status === 'planned',
          )
          .map((entry) => entry.id),
      ),
  );

  const toggle = (entry: PlanEntryView) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });

  const save = () => {
    if (!store) return;
    const ids = [...selected];
    const writes = listId
      ? setShoppingListEntries(tables, listId, ids)
      : createShoppingList(tables, ids, today, Date.now(), createId).writes;
    applyWrites(store, writes);
    router.back();
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: listId ? 'Gerichte der Liste' : 'Neue Einkaufsliste' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Hint>Geplante Gerichte der nächsten vier Wochen. Ihre Zutaten kommen auf die Liste.</Hint>
        {entries.length === 0 ? <Hint>Im Plan steht noch kein Gericht mit Rezept.</Hint> : null}
        {entries.map((entry) => {
          const checked = selected.has(entry.id);
          const elsewhere = entry.shoppingListId !== listId && openLists.has(entry.shoppingListId);
          return (
            <Pressable
              key={entry.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${entry.title}, ${formatShortDate(entry.date)}`}
              onPress={() => toggle(entry)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.box, checked && styles.boxChecked]}>
                {checked ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <View style={styles.text}>
                <Text style={styles.title}>
                  {formatShortDate(entry.date)} · {entry.title}
                </Text>
                <Text style={styles.meta}>
                  {[describePlanEntry(entry), elsewhere ? 'steht schon auf einer anderen Liste' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={listId ? 'Übernehmen' : `Liste erstellen (${selected.size})`}
          disabled={!listId && selected.size === 0}
          onPress={save}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.primary },
  check: { color: colors.primaryText, fontSize: 15, fontWeight: '700', lineHeight: 18 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
