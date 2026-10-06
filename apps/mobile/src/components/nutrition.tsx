import {
  formatNumber,
  NUTRIENT_INFO,
  NUTRITION_CREDITS,
  planEntryNutrition,
  recipeNutrition,
  type Nutrient,
  type NutritionSummary,
} from '@zauberjournal/core';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTables } from '@/data/tables';
import { colors, fonts, spacing } from '@/theme';

import { Card, SectionTitle } from './ui';

/** Hauptwerte groß, die übrigen klein darunter. */
const MAIN: Nutrient[] = ['protein', 'fat', 'carbs'];
const DETAILS: Nutrient[] = ['sugar', 'saturatedFat', 'fiber', 'salt'];
const SHORT: Partial<Record<Nutrient, string>> = { carbs: 'Kohlenhydr.', saturatedFat: 'ges. Fettsäuren' };

function amount(value: number, nutrient: Nutrient): string {
  if (nutrient === 'kcal') return `${Math.round(value)} kcal`;
  return `${formatNumber(value >= 10 ? Math.round(value) : Math.round(value * 10) / 10, 'decimal')} g`;
}

/**
 * Nährwerte einer Portion oder Person: Energie, Eiweiß, Fett, Kohlenhydrate und der Rest klein.
 * „≥“ heißt: Bei einer Zutat fehlt dieser Wert, es ist also mindestens so viel.
 */
function NutritionValues({ title, note, summary }: { title: string; note?: string; summary: NutritionSummary }) {
  const empty = summary.values.kcal === 0;
  const shown = (key: Nutrient) => `${summary.incomplete.includes(key) ? '≥ ' : ''}${amount(summary.values[key], key)}`;
  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
          {note ? <Text style={styles.note}>{`  ${note}`}</Text> : null}
        </Text>
        <Text style={styles.kcal}>{empty ? '–' : amount(summary.values.kcal, 'kcal')}</Text>
      </View>
      {empty ? null : (
        <>
          <View style={styles.main}>
            {MAIN.map((key) => (
              <View key={key} style={styles.mainItem}>
                <Text style={styles.mainValue}>{shown(key)}</Text>
                <Text style={styles.mainLabel}>{SHORT[key] ?? NUTRIENT_INFO[key].label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.details}>
            {DETAILS.map((key) =>
              // Geschützte Leerzeichen: Jede Angabe bleibt beim Umbrechen zusammen.
              `${SHORT[key] ?? NUTRIENT_INFO[key].label.replace('davon ', '')} ${shown(key)}`.replace(/ /g, ' '),
            ).join(' · ')}
          </Text>
        </>
      )}
      {summary.missing.length > 0 ? <Text style={styles.missing}>{`Ohne Werte: ${summary.missing.join(', ')}`}</Text> : null}
    </View>
  );
}

function Credits() {
  return <Text style={styles.credits}>{`Quellen: ${NUTRITION_CREDITS.bls}; ${NUTRITION_CREDITS.off}`}</Text>;
}

function portions(count: number): string {
  return `${formatNumber(count, 'fraction')} ${count === 1 ? 'Portion' : 'Portionen'}`;
}

/** Nährwerte eines Planeintrags je Person, passend zu ihren Portionen und Optionen. */
export function PlanEntryNutrition({ entryId }: { entryId: string }) {
  const tables = useAppTables();
  const eaters = useMemo(() => planEntryNutrition(tables, entryId), [tables, entryId]);
  if (eaters.length === 0) return null;
  return (
    <>
      <SectionTitle>Nährwerte</SectionTitle>
      <Card style={styles.card}>
        {eaters.map((eater, index) => (
          <View key={eater.eaterId} style={index > 0 ? styles.divider : null}>
            <NutritionValues title={eater.name} note={portions(eater.servings)} summary={eater.summary} />
          </View>
        ))}
      </Card>
      <Credits />
    </>
  );
}

/** Nährwerte je Portion eines Rezepts; mit Wahlkomponente je Option. */
export function RecipeNutrition({ recipeId }: { recipeId: string }) {
  const tables = useAppTables();
  const portionsList = useMemo(() => recipeNutrition(tables, recipeId), [tables, recipeId]);
  if (portionsList.length === 0 || portionsList.every((portion) => portion.summary.values.kcal === 0)) return null;
  return (
    <>
      <SectionTitle>Nährwerte pro Portion</SectionTitle>
      <Card style={styles.card}>
        {portionsList.map((portion, index) => (
          <View key={portion.label || 'portion'} style={index > 0 ? styles.divider : null}>
            <NutritionValues title={portion.label || '1 Portion'} summary={portion.summary} />
          </View>
        ))}
      </Card>
      <Credits />
    </>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.xs, gap: 0 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  block: { gap: spacing.sm, paddingVertical: spacing.md },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  note: { fontSize: 14, fontWeight: '400', color: colors.textMuted },
  kcal: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.text },
  main: { flexDirection: 'row', gap: spacing.sm },
  mainItem: { flex: 1, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm, borderRadius: 10, backgroundColor: colors.surfaceSunken },
  mainValue: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  mainLabel: { fontSize: 12.5, color: colors.textMuted },
  details: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  missing: { fontSize: 13, lineHeight: 18, color: colors.warning },
  credits: { marginTop: -spacing.xs, fontSize: 12, lineHeight: 16, color: colors.textMuted },
});
