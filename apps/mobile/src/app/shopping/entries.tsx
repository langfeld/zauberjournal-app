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

import { Icon } from '@/components/icon';
import { RecipeThumbnail } from '@/components/recipe-photo';
import { Button, EmptyState, Hint, Tag } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables, useToday } from '@/data/tables';
import { colors, fonts, radius, shadows, spacing, tones } from '@/theme';

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
        {entries.length === 0 ? (
          <EmptyState icon="calendar_month" title="Nichts geplant">
            Im Plan steht noch kein Gericht mit Rezept.
          </EmptyState>
        ) : null}
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
              style={({ pressed }) => [styles.row, checked && styles.rowChecked, pressed && styles.pressed]}>
              <View style={[styles.box, checked && styles.boxChecked]}>
                {checked ? <Icon name="check" size={16} color={colors.primaryText} /> : null}
              </View>
              <RecipeThumbnail photoId={entry.recipe?.photo ?? ''} title={entry.title} size={44} />
              <View style={styles.text}>
                <Text style={styles.date}>{formatShortDate(entry.date)}</Text>
                <Text style={styles.title} numberOfLines={2}>
                  {entry.title}
                </Text>
                <Text style={styles.meta}>{describePlanEntry(entry)}</Text>
                {elsewhere ? <Tag icon="shopping_cart" label="steht schon auf einer anderen Liste" tone={tones.ochre} /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          icon={listId ? 'check' : 'add_shopping_cart'}
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
  content: { padding: spacing.lg, gap: spacing.sm + 2, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  rowChecked: { borderColor: colors.primary },
  pressed: { opacity: 0.8 },
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
  text: { flex: 1, gap: 2 },
  date: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 16.5, lineHeight: 21, color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
