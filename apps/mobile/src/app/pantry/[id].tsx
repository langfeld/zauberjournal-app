import {
  correctStock,
  createId,
  formatDate,
  formatShortDate,
  formatStock,
  FOOD_CATEGORIES,
  FOOD_DIETS,
  isActive,
  listFoods,
  mergeFoods,
  parseStockAmount,
  setStaple,
  setStockUnit,
  SHELF_LIFE_DAYS,
  STOCK_UNITS,
  stockBookings,
  stockStates,
  stockUnitFromRecipes,
  todayKey,
  updateFood,
  type FoodCategory,
  type FoodDiet,
  type FoodStock,
  type PantryBookingRow,
  type RowWrite,
  type ShoppingTables,
  type StockUnit,
} from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { CATEGORY_STYLES } from '@/components/category-style';
import { FoodNutrition } from '@/components/food-nutrition';
import { Icon } from '@/components/icon';
import { NotFound } from '@/components/not-found';
import {
  Button,
  Card,
  Chip,
  Hint,
  IconButton,
  IconCircle,
  SearchField,
  SectionTitle,
  Segmented,
  TextField,
  type SegmentOption,
} from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables, useToday } from '@/data/tables';
import { confirm } from '@/lib/confirm';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

const DIETS: { id: FoodDiet; label: string }[] = [{ id: '', label: 'unbekannt' }, ...FOOD_DIETS];
const STOCKS: SegmentOption<FoodStock>[] = [
  { id: 'have', label: 'da' },
  { id: 'buy', label: 'nachkaufen', color: colors.accent },
];
const UNIT_LABELS: Record<StockUnit, string> = { g: 'Gramm', ml: 'Milliliter', Stück: 'Stück' };
/** So viele Buchungen zeigt die Seite, die neuesten zuerst. */
const MAX_BOOKINGS = 8;

/** Tag einer Buchung; beim Kochen der Tag im Plan, auch wenn erst später abgebucht wurde. */
function bookingDay(tables: ShoppingTables, booking: PantryBookingRow): string {
  const entry = booking.reason === 'cooked' ? tables.planEntries[booking.entryId] : undefined;
  return entry?.date ?? todayKey(new Date(booking.createdAt));
}

/** Wofür gebucht wurde: das gekochte Gericht oder die Einkaufsliste. */
function bookingTitle(tables: ShoppingTables, booking: PantryBookingRow): string {
  if (booking.reason === 'cooked') {
    const entry = tables.planEntries[booking.entryId];
    const title = entry ? tables.recipes[entry.recipeId]?.title : undefined;
    return title ? `Gekocht: ${title}` : 'Gekocht';
  }
  if (booking.reason === 'purchase') return tables.shoppingLists[booking.listId]?.name || 'Einkauf';
  return 'Bestand eingetragen';
}

export default function FoodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const tables = useAppTables();
  const today = useToday();
  const [query, setQuery] = useState('');
  const [stockText, setStockText] = useState('');
  const [chosenUnit, setChosenUnit] = useState<StockUnit | null>(null);
  const food = tables.foods[id];
  const others = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de');
    if (!needle) return [];
    return listFoods(tables)
      .filter((other) => other.id !== id && other.name.toLocaleLowerCase('de').includes(needle))
      .slice(0, 8);
  }, [tables, id, query]);
  const state = useMemo(() => stockStates(tables, today).get(id), [tables, today, id]);

  if (!food || !isActive(food)) {
    return <NotFound message="Dieses Lebensmittel gibt es nicht (mehr)." backLabel="Zum Vorrat" href="/pantry" />;
  }

  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };
  const merge = async (intoId: string, intoName: string, now: number) => {
    const message = `„${food.name}“ und „${intoName}“ werden ein Lebensmittel. Zutaten mit dem Namen „${food.name}“ zählen danach zu „${intoName}“.`;
    if (!(await confirm('Zusammenführen?', message, 'Zusammenführen'))) return;
    write(mergeFoods(tables, id, intoId, now));
    router.back();
  };
  const style = CATEGORY_STYLES[food.category as FoodCategory] ?? CATEGORY_STYLES.other;

  const staple = Boolean(food.stock);
  // Ohne Vorratseinheit wählt man sie beim ersten Eintragen; vorgeschlagen ist die der Rezepte.
  const unit: StockUnit = food.stockUnit || chosenUnit || stockUnitFromRecipes(tables, id) || 'g';
  const level = state?.level ?? 0;
  const shelfLife = SHELF_LIFE_DAYS[food.category as FoodCategory];
  const bookings = food.stockUnit ? stockBookings(tables, id).slice(0, MAX_BOOKINGS) : [];
  const newStock = parseStockAmount(stockText);
  const changeUnit = async (next: StockUnit) => {
    if (!food.stockUnit) {
      setChosenUnit(next);
      return;
    }
    if (next === food.stockUnit) return;
    if (level !== 0) {
      const message = `Die ${formatStock(level, food.stockUnit)} zählen in ${UNIT_LABELS[next]} nicht mit. Tragt danach den Bestand neu ein.`;
      if (!(await confirm('Einheit ändern?', message, 'Ändern'))) return;
    }
    write(setStockUnit(tables, id, next));
  };
  const saveStock = (amount: number | null, now: number) => {
    if (amount === null) return;
    write(correctStock(tables, id, amount, now, createId, unit));
    setStockText('');
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: food.name || 'Lebensmittel' }} />
      <Card style={styles.nameCard}>
        <IconCircle icon={style.icon} tone={style.tone} size={48} square />
        <TextField
          label="Name"
          value={food.name}
          onChangeText={(name) => write(updateFood(tables, id, { name }))}
          containerStyle={styles.grow}
        />
      </Card>

      <SectionTitle>Vorrat</SectionTitle>
      <Card style={styles.stockCard}>
        <View style={styles.stockHeader}>
          <Text style={styles.stockLabel}>Bestand</Text>
          <Text style={[styles.stockValue, food.stockUnit && level <= 0 ? styles.stockEmpty : null]}>
            {food.stockUnit ? (level > 0 ? formatStock(level, food.stockUnit) : 'leer') : '–'}
          </Text>
        </View>
        {state?.expiresOn ? (
          <Text style={styles.stockNote}>Frisch gekauft, zählt bis {formatDate(state.expiresOn)}</Text>
        ) : shelfLife ? (
          <Text style={styles.stockNote}>Frisches zählt {shelfLife} Tage nach dem Einkauf, danach gilt es als verbraucht.</Text>
        ) : null}
        {!food.stockUnit ? (
          <Text style={styles.stockNote}>Die Menge kommt mit dem nächsten Einkauf. Ihr könnt sie auch selbst eintragen.</Text>
        ) : null}
        <View style={styles.chips}>
          {STOCK_UNITS.map((option) => (
            <Chip
              key={option}
              label={UNIT_LABELS[option]}
              accessibilityLabel={`Bestand in ${UNIT_LABELS[option]}`}
              selected={option === unit}
              onPress={() => void changeUnit(option)}
            />
          ))}
        </View>
        <TextField
          label="Bestand neu eintragen"
          value={stockText}
          onChangeText={setStockText}
          placeholder={`Menge in ${UNIT_LABELS[unit]}`}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={() => saveStock(newStock, Date.now())}
          trailing={
            <IconButton
              icon="check"
              variant="primary"
              size={36}
              accessibilityLabel="Bestand übernehmen"
              disabled={newStock === null}
              onPress={() => saveStock(newStock, Date.now())}
            />
          }
        />
        {food.stockUnit && level > 0 ? (
          <Button variant="secondary" small icon="remove_shopping_cart" title="Aufgebraucht" onPress={() => saveStock(0, Date.now())} />
        ) : null}
      </Card>

      <Card style={styles.stapleCard}>
        <View style={styles.stapleRow}>
          <Icon name="home" size={22} color={staple ? colors.primary : colors.textMuted} />
          <View style={styles.grow}>
            <Text style={styles.stapleTitle}>Immer im Haus haben</Text>
            <Text style={styles.stapleText}>Kommt von selbst auf die Einkaufsliste, sobald es leer ist.</Text>
          </View>
          <Switch
            accessibilityLabel="Immer im Haus haben"
            value={staple}
            onValueChange={(value) => write(setStaple(tables, id, value))}
            trackColor={{ false: colors.borderStrong, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>
        {staple && !food.stockUnit ? (
          <Segmented options={STOCKS} value={food.stock ?? 'have'} onChange={(stock) => write(updateFood(tables, id, { stock }))} />
        ) : null}
      </Card>

      {bookings.length > 0 ? (
        <>
          <SectionTitle>Letzte Buchungen</SectionTitle>
          <Card style={styles.bookings}>
            {bookings.map((booking, index) => (
              <View key={booking.id} style={[styles.booking, index > 0 && styles.divider]}>
                <View style={styles.grow}>
                  <Text style={styles.bookingTitle} numberOfLines={1}>
                    {bookingTitle(tables, booking)}
                  </Text>
                  <Text style={styles.bookingDate}>{formatShortDate(bookingDay(tables, booking))}</Text>
                </View>
                <Text style={[styles.bookingAmount, booking.amount > 0 && styles.bookingIn]}>
                  {`${booking.amount > 0 ? '+' : '−'}${formatStock(Math.abs(booking.amount), booking.unit)}`}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <FoodNutrition foodId={id} />

      <SectionTitle>Warengruppe</SectionTitle>
      <View style={styles.chips}>
        {FOOD_CATEGORIES.map((category) => (
          <Chip
            key={category.id}
            icon={CATEGORY_STYLES[category.id].icon}
            label={category.label}
            selected={food.category === category.id}
            onPress={() => write(updateFood(tables, id, { category: category.id }))}
          />
        ))}
      </View>

      <SectionTitle>Ernährung</SectionTitle>
      <Hint>Bestimmt, welche Option eine vegetarische Person im Plan automatisch bekommt.</Hint>
      <View style={styles.chips}>
        {DIETS.map((diet) => (
          <Chip
            key={diet.id || 'unknown'}
            icon={diet.id === 'vegan' || diet.id === 'vegetarian' ? 'eco' : undefined}
            label={diet.label}
            selected={food.diet === diet.id}
            onPress={() => write(updateFood(tables, id, { diet: diet.id }))}
          />
        ))}
      </View>

      <SectionTitle>Dasselbe wie …</SectionTitle>
      <Hint>Wenn es dieses Lebensmittel doppelt gibt, z. B. „Lauchzwiebeln“ und „Frühlingszwiebeln“.</Hint>
      <SearchField
        accessibilityLabel="Lebensmittel zum Zusammenführen suchen"
        value={query}
        onChangeText={setQuery}
        placeholder="Anderes Lebensmittel suchen"
      />
      {others.map((other) => (
        <Pressable
          key={other.id}
          accessibilityRole="button"
          accessibilityLabel={`Mit ${other.name} zusammenführen`}
          onPress={() => void merge(other.id, other.name, Date.now())}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
          <Text style={styles.optionText}>{other.name}</Text>
          <Icon name="merge" size={20} color={colors.primary} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  nameCard: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  grow: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  option: {
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
  optionText: { flex: 1, fontSize: 16, color: colors.text },
  stockCard: { gap: spacing.md },
  stockHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  stockLabel: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  stockValue: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.text },
  stockEmpty: { color: colors.accent },
  stockNote: { marginTop: -spacing.xs, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  stapleCard: { gap: spacing.md },
  stapleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stapleTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  stapleText: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  bookings: { paddingVertical: spacing.xs, gap: 0 },
  booking: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  bookingTitle: { fontSize: 15, color: colors.text },
  bookingDate: { fontSize: 13, color: colors.textMuted },
  bookingAmount: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  bookingIn: { color: colors.primary },
});
