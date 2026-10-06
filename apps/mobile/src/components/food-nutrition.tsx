import {
  chooseFoodNutrition,
  formatNumber,
  NUTRIENT_INFO,
  NUTRIENTS,
  NUTRITION_CREDITS,
  parseStockAmount,
  pieceUnitOf,
  resetFoodNutrition,
  setGramsPerPiece,
  unitLabel,
  type Per100,
  type RowWrite,
} from '@zauberjournal/core';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { searchNutrition, type BlsEntry } from '@/data/api';
import { useConnection } from '@/data/connection';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables } from '@/data/tables';
import { errorMessage } from '@/lib/error-message';
import { colors, spacing } from '@/theme';

import { Icon } from './icon';
import { Button, Card, Hint, SearchField, SectionTitle, TextField } from './ui';

/** Ein Wert je 100 g; „–“, wenn er unbekannt ist. */
function value(amount: number | null | undefined, unit: 'kcal' | 'g'): string {
  if (amount === null || amount === undefined) return '–';
  return unit === 'kcal' ? `${Math.round(amount)} kcal` : `${formatNumber(Math.round(amount * 10) / 10, 'decimal')} g`;
}

function entryMeta(per100: Per100): string {
  const protein = per100.protein === null ? '' : ` · Eiweiß ${value(per100.protein, 'g')}`;
  return `${value(per100.kcal, 'kcal')}${protein} je 100 g`;
}

/** Nährwerte eines Lebensmittels: woher sie kommen, die Werte je 100 g, das Stückgewicht und eine Auswahl von Hand. */
export function FoodNutrition({ foodId }: { foodId: string }) {
  const store = useStore();
  const tables = useAppTables();
  const { credentials } = useConnection();
  const row = tables.foodNutrition[foodId];
  const pieceUnit = pieceUnitOf(tables, foodId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BlsEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gramsText, setGramsText] = useState<string | null>(null);

  // Suche im BLS über den Server, kurz nach dem Tippen.
  useEffect(() => {
    const text = query.trim();
    if (!credentials || text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchNutrition(credentials, text, controller.signal)
        .then((found) => {
          setResults(found.slice(0, 8));
          setError(null);
        })
        .catch((problem: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(problem));
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [credentials, query]);

  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };
  const choose = (entry: BlsEntry, now: number) => {
    write(chooseFoodNutrition(tables, foodId, { code: entry.code, label: entry.name, per100: entry.per100 }, now));
    setQuery('');
  };
  const saveGrams = () => {
    if (gramsText === null) return;
    write(setGramsPerPiece(tables, foodId, gramsText.trim() ? parseStockAmount(gramsText) : null));
    setGramsText(null);
  };

  const source = row?.source ?? '';
  const known = (source === 'bls' || source === 'off') && typeof row?.kcal === 'number';
  const status =
    source === 'bls'
      ? `BLS: ${row?.label}`
      : source === 'off'
        ? `Open Food Facts: ${row?.label}`
        : source === 'none'
          ? 'Nichts Passendes gefunden. Unten lässt sich ein Eintrag suchen.'
          : 'Noch nicht zugeordnet. Das passiert von selbst, sobald der Server erreichbar ist.';
  const pieceLabel = pieceUnit === 'Stück' ? 'Stück' : unitLabel(pieceUnit, false);
  // Treffer gelten nur, solange gesucht wird.
  const shown = query.trim().length >= 2 ? results : [];

  return (
    <>
      <SectionTitle>Nährwerte</SectionTitle>
      <Card style={styles.card}>
        <View style={styles.status}>
          <Icon name={known ? 'nutrition' : 'info'} size={20} color={known ? colors.primary : colors.textMuted} />
          <Text style={styles.statusText}>{status}</Text>
        </View>
        {known && row ? (
          <View style={styles.table}>
            <Text style={styles.tableTitle}>je 100 g</Text>
            {NUTRIENTS.map((key) => (
              <View key={key} style={styles.tableRow}>
                <Text style={[styles.tableLabel, NUTRIENT_INFO[key].label.startsWith('davon') && styles.indented]}>
                  {NUTRIENT_INFO[key].label}
                </Text>
                <Text style={styles.tableValue}>{value(row[key], NUTRIENT_INFO[key].unit)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {pieceUnit || row?.gramsPerPiece ? (
          <TextField
            label={`Gewicht pro ${pieceLabel || 'Stück'}`}
            value={gramsText ?? (row?.gramsPerPiece ? formatNumber(row.gramsPerPiece, 'decimal') : '')}
            onChangeText={setGramsText}
            onBlur={saveGrams}
            onSubmitEditing={saveGrams}
            placeholder="unbekannt"
            keyboardType="decimal-pad"
            returnKeyType="done"
            trailing={<Text style={styles.suffix}>g</Text>}
          />
        ) : null}
        {row?.pinned ? (
          <Button variant="secondary" small icon="refresh" title="Wieder automatisch zuordnen" onPress={() => write(resetFoodNutrition(tables, foodId))} />
        ) : null}
        {known ? <Text style={styles.credits}>{`Quelle: ${source === 'off' ? NUTRITION_CREDITS.off : NUTRITION_CREDITS.bls}`}</Text> : null}
      </Card>

      <Hint>Passt die Zuordnung nicht, einen anderen Eintrag aus dem Bundeslebensmittelschlüssel wählen.</Hint>
      <SearchField accessibilityLabel="Eintrag im BLS suchen" value={query} onChangeText={setQuery} placeholder="Im BLS suchen, z. B. Speisezwiebel" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {shown.length > 0 ? (
        <Card style={styles.results}>
          {shown.map((entry, index) => {
            const chosen = source === 'bls' && row?.code === entry.code;
            return (
              <Pressable
                key={entry.code}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                accessibilityLabel={`${entry.name} wählen`}
                onPress={() => choose(entry, Date.now())}
                style={({ pressed }) => [styles.result, index > 0 && styles.divider, pressed && styles.pressed]}>
                <View style={styles.resultText}>
                  <Text style={styles.resultName}>{entry.name}</Text>
                  <Text style={styles.resultMeta}>{entryMeta(entry.per100)}</Text>
                </View>
                {chosen ? <Icon name="check_circle" size={24} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  statusText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  table: { gap: 2 },
  tableTitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 2 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 3 },
  tableLabel: { flex: 1, fontSize: 14, color: colors.text },
  indented: { paddingLeft: spacing.md, color: colors.textMuted },
  tableValue: { fontSize: 14, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  suffix: { fontSize: 15, color: colors.textMuted },
  credits: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
  error: { fontSize: 14, color: colors.danger },
  results: { paddingVertical: spacing.xs, gap: 0 },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  resultText: { flex: 1, gap: 2 },
  resultName: { fontSize: 15, color: colors.text },
  resultMeta: { fontSize: 13, color: colors.textMuted },
});
