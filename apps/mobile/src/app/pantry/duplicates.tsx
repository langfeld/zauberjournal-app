import { isActive, listFoods, mergeFoodGroup, type FoodDuplicateGroup, type ShoppingTables } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, CardHeader, Chip, EmptyState, Hint, Notice } from '@/components/ui';
import { findDuplicateFoods } from '@/data/api';
import { useConnection } from '@/data/connection';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables } from '@/data/tables';
import { errorMessage } from '@/lib/error-message';
import { colors, radius, spacing, tones } from '@/theme';

/** Die KI schlägt vor, welche Lebensmittel dasselbe meinen; zusammengeführt wird erst nach einem Tipp je Gruppe. */
export default function DuplicatesScreen() {
  const { credentials } = useConnection();
  const store = useStore();
  const tables = useAppTables();
  const latest = useRef<ShoppingTables>(tables);
  const [groups, setGroups] = useState<FoodDuplicateGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Gewählter Name je Gruppe, wenn nicht der Vorschlag der KI */
  const [kept, setKept] = useState<Record<number, string>>({});
  const [skipped, setSkipped] = useState<number[]>([]);
  const [merged, setMerged] = useState<string[]>([]);

  useEffect(() => {
    latest.current = tables;
  }, [tables]);

  const search = useCallback(async () => {
    if (!credentials) return;
    try {
      const foods = listFoods(latest.current).map(({ id, name, category }) => ({ id, name, category }));
      setGroups(await findDuplicateFoods(credentials, foods));
    } catch (problem) {
      setError(errorMessage(problem));
    }
  }, [credentials]);

  useEffect(() => {
    void search();
  }, [search]);

  const retry = () => {
    setError(null);
    setGroups(null);
    void search();
  };

  const nameOf = (id: string) => tables.foods[id]?.name ?? '';
  // Was inzwischen gelöscht oder zusammengeführt ist, fällt weg; eine Gruppe braucht mindestens zwei.
  const open = (groups ?? []).flatMap((group, index) => {
    const foodIds = group.foodIds.filter((id) => tables.foods[id] && isActive(tables.foods[id]!));
    const keepId = kept[index] ?? group.keepId;
    return foodIds.length >= 2 && !skipped.includes(index)
      ? [{ index, foodIds, keepId: foodIds.includes(keepId) ? keepId : foodIds[0]!, reason: group.reason }]
      : [];
  });

  const merge = (foodIds: string[], keepId: string, now: number) => {
    if (!store) return;
    applyWrites(store, mergeFoodGroup(tables, keepId, foodIds, now));
    setMerged([...merged, nameOf(keepId)]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Doppelte Lebensmittel' }} />
      {!credentials ? (
        <Card>
          <CardHeader icon="cloud_off" title="Erst mit dem Haushalt verbinden" tone={tones.ochre} />
          <Text style={styles.body}>Die KI fragt der Server deines Haushalts.</Text>
          <Button variant="secondary" icon="home" title="Zum Haushalt" onPress={() => router.push('/household')} />
        </Card>
      ) : error ? (
        <>
          <Notice tone="danger">{error}</Notice>
          <Button variant="secondary" icon="refresh" title="Nochmal versuchen" onPress={retry} />
        </>
      ) : !groups ? (
        <View style={styles.busy} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.busyText}>Die KI sieht sich die Lebensmittel an. Das dauert meist ein paar Sekunden.</Text>
        </View>
      ) : (
        <>
          <Hint>
            Die KI schlägt vor, welche Namen dasselbe meinen. Beim Zusammenführen gehen gemerkte REWE-Produkte, Nährwerte und Vorrat
            auf den Namen über, der bleibt. Rückgängig machen lässt es sich nicht.
          </Hint>
          {merged.length > 0 ? <Notice>{`Zusammengeführt: ${merged.join(', ')}`}</Notice> : null}
          {open.map((group) => (
            <Card key={group.index}>
              {group.reason ? <Text style={styles.reason}>{group.reason}</Text> : null}
              <Text style={styles.label}>Dieser Name bleibt:</Text>
              <View style={styles.chips}>
                {group.foodIds.map((id) => (
                  <Chip
                    key={id}
                    label={nameOf(id)}
                    selected={id === group.keepId}
                    accessibilityLabel={`„${nameOf(id)}“ behalten`}
                    onPress={() => setKept({ ...kept, [group.index]: id })}
                  />
                ))}
              </View>
              <View style={styles.actions}>
                <Button small icon="merge" title="Zusammenführen" onPress={() => merge(group.foodIds, group.keepId, Date.now())} />
                <Button small variant="ghost" title="Überspringen" onPress={() => setSkipped([...skipped, group.index])} />
              </View>
            </Card>
          ))}
          {open.length === 0 ? (
            <EmptyState icon="task_alt" title={groups.length === 0 ? 'Nichts Doppeltes gefunden' : 'Alles durchgesehen'}>
              {groups.length === 0 ? 'Jedes Lebensmittel steht nur unter einem Namen im Katalog.' : undefined}
            </EmptyState>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  busyText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  reason: { fontSize: 15, lineHeight: 21, color: colors.text },
  label: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
