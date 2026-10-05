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
  type ShoppingListEntry,
} from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_STYLES } from '@/components/category-style';
import { Icon } from '@/components/icon';
import { RecipeCover } from '@/components/recipe-photo';
import { ReweListCard } from '@/components/rewe-list-card';
import { ShoppingItemRow } from '@/components/shopping-item-row';
import { AddField, Button, Card, Chip, EmptyState, Hint, IconCircle, ProgressBar } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useReweMatch } from '@/data/rewe-match';
import { useStore } from '@/data/store';
import { useAppTables, useToday } from '@/data/tables';
import { confirm } from '@/lib/confirm';
import { colors, fonts, radius, spacing, tones } from '@/theme';

/** Kleine Karte für ein Gericht der Liste; viele passen in eine Reihe zum Wischen. */
function EntryCard({ entry }: { entry: ShoppingListEntry }) {
  return (
    <View style={styles.entryCard}>
      <RecipeCover photoId={entry.photo} title={entry.title} aspectRatio={4 / 3} letterSize={34} />
      <View style={styles.entryText}>
        <Text style={styles.entryDate}>{formatShortDate(entry.date)}</Text>
        <Text style={styles.entryTitle} numberOfLines={2}>
          {entry.title}
        </Text>
      </View>
    </View>
  );
}

export default function ShoppingScreen() {
  const store = useStore();
  const tables = useAppTables();
  const today = useToday();
  const lists = useMemo(() => listOpenShoppingLists(tables), [tables]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newItem, setNewItem] = useState('');
  const [showDone, setShowDone] = useState(false);
  const rewe = useReweMatch();
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
        <EmptyState icon="shopping_cart" title="Keine offene Einkaufsliste">
          Wähle geplante Gerichte aus; die Zutaten werden zusammengerechnet und nach Warengruppen sortiert.
        </EmptyState>
        <Button icon="calendar_month" title="Aus dem Plan erstellen" onPress={() => router.push('/shopping/entries')} />
        <Button
          variant="secondary"
          title="Leere Liste"
          onPress={() => write(createShoppingList(tables, [], today, Date.now(), createId).writes)}
        />
      </ScrollView>
    );
  }

  const open = view.sections.reduce((sum, section) => sum + section.items.length, 0) + view.pantry.length;
  const total = open + view.done.length;

  const addItem = () => {
    if (!newItem.trim()) return;
    write(addManualItem(tables, view.id, newItem, Date.now(), createId));
    setNewItem('');
  };
  const finish = async () => {
    const message = open > 0 ? `${open} Positionen sind noch nicht abgehakt.` : 'Die Liste wird abgeschlossen.';
    if (!(await confirm('Einkauf abschließen?', message, 'Abschließen'))) return;
    write(completeShoppingList(tables, view.id));
  };
  const toggle = (itemId: string, checked: boolean) => write(checkShoppingItem(tables, itemId, checked));
  const openProduct = (itemId: string) => router.push({ pathname: '/shopping/product', params: { item: itemId } });

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

      <Card>
        <View style={styles.progressRow}>
          <Text style={styles.progressTitle}>
            {total === 0 ? 'Noch leer' : open === 0 ? 'Alles erledigt' : `Noch ${open} von ${total}`}
          </Text>
          {total > 0 ? <Text style={styles.progressCount}>{Math.round((view.done.length / total) * 100)} %</Text> : null}
        </View>
        <ProgressBar value={total > 0 ? view.done.length / total : 0} />
        <View style={styles.entriesHeader}>
          <Text style={styles.entriesLabel}>
            {view.entries.length === 0
              ? 'Noch keine Gerichte'
              : `Für ${view.entries.length} ${view.entries.length === 1 ? 'Gericht' : 'Gerichte'}`}
          </Text>
          <Button
            small
            variant="secondary"
            icon="restaurant"
            title="Gerichte wählen"
            onPress={() => router.push({ pathname: '/shopping/entries', params: { list: view.id } })}
          />
        </View>
        {view.entries.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.entries} contentContainerStyle={styles.entriesRow}>
            {view.entries.map((entry) => (
              <EntryCard key={entry.entryId} entry={entry} />
            ))}
          </ScrollView>
        ) : null}
      </Card>

      {rewe.connected ? (
        <ReweListCard
          summary={view.rewe}
          settings={rewe.settings}
          progress={rewe.progress}
          error={rewe.error}
          onMatch={() => void rewe.run(tables, view.id)}
        />
      ) : null}

      <AddField
        accessibilityLabel="Artikel hinzufügen"
        value={newItem}
        onChangeText={setNewItem}
        onAdd={addItem}
        placeholder="Hinzufügen, z. B. 2 l Milch"
      />

      {view.sections.map((section) => {
        const style = CATEGORY_STYLES[section.category];
        return (
          <Card key={section.category} style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconCircle icon={style.icon} tone={style.tone} size={34} square />
              <Text style={styles.sectionTitle}>{section.label}</Text>
              <Text style={styles.sectionCount}>{section.items.length}</Text>
            </View>
            <View>
              {section.items.map((item, index) => (
                <ShoppingItemRow
                  key={item.id}
                  item={item}
                  divider={index > 0}
                  onToggle={() => toggle(item.id, true)}
                  onRemove={item.origin === 'manual' ? () => write(removeShoppingItem(item.id, Date.now())) : undefined}
                  onOpenProduct={rewe.connected && rewe.settings.marketId ? () => openProduct(item.id) : undefined}
                />
              ))}
            </View>
          </Card>
        );
      })}
      {view.sections.length === 0 && view.pantry.length === 0 ? (
        view.done.length > 0 ? (
          <EmptyState icon="task_alt" title="Alles abgehakt">
            Fertig? Dann den Einkauf unten abschließen.
          </EmptyState>
        ) : (
          <Hint>Die Liste ist leer.</Hint>
        )
      ) : null}

      {view.pantry.length > 0 ? (
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconCircle icon="inventory_2" tone={tones.ochre} size={34} square />
            <Text style={styles.sectionTitle}>Vorrat prüfen</Text>
            <Text style={styles.sectionCount}>{view.pantry.length}</Text>
          </View>
          <Hint>Laut Vorrat da. Abhaken, wenn genug da ist, sonst „Kaufen“.</Hint>
          <View>
            {view.pantry.map((item, index) => (
              <ShoppingItemRow
                key={item.id}
                item={item}
                divider={index > 0}
                onToggle={() => toggle(item.id, true)}
                action={{ title: 'Kaufen', onPress: () => write(updateFood(tables, item.foodId, { stock: 'buy' })) }}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {view.done.length > 0 ? (
        <Card style={styles.section}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDone }}
            onPress={() => setShowDone((current) => !current)}
            style={styles.sectionHeader}>
            <IconCircle icon="task_alt" tone={tones.green} size={34} square />
            <Text style={styles.sectionTitle}>Erledigt</Text>
            <Text style={styles.sectionCount}>{view.done.length}</Text>
            <Icon name={showDone ? 'expand_less' : 'expand_more'} size={22} color={colors.textMuted} />
          </Pressable>
          {showDone ? (
            <View>
              {view.done.map((item, index) => (
                <ShoppingItemRow key={item.id} item={item} divider={index > 0} onToggle={() => toggle(item.id, false)} />
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      <View style={styles.finish}>
        <Button variant="secondary" icon="task_alt" title="Einkauf abschließen" onPress={() => void finish()} />
        <Hint>Danach gelten die Gerichte im Plan als eingekauft, und die nächste Liste fängt leer an.</Hint>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progressTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.text },
  progressCount: { fontSize: 14, fontWeight: '700', color: colors.primary },
  entriesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  entriesLabel: { flexShrink: 1, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textMuted },
  // Die Reihe reicht bis an die Kartenränder, damit man sieht, dass sie sich wischen lässt.
  entries: { marginHorizontal: -spacing.lg },
  entriesRow: { gap: spacing.sm + 2, paddingHorizontal: spacing.lg },
  entryCard: {
    width: 120,
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.background,
  },
  entryText: { padding: spacing.sm, gap: 2 },
  entryDate: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.4, color: colors.primary },
  entryTitle: { fontFamily: fonts.display, fontSize: 14, lineHeight: 18, color: colors.text },
  section: { paddingVertical: spacing.md, gap: spacing.xs },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.xs },
  sectionTitle: { flex: 1, fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.text },
  sectionCount: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  finish: { gap: spacing.sm, marginTop: spacing.lg },
});
