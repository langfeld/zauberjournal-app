import {
  addDays,
  createId,
  formatDate,
  formatDuration,
  formatRelativeDate,
  isRecipePaused,
  listRecipes,
  MEALS,
  nextFreeSlot,
  PLAN_FROM_TOMORROW_HOUR,
  planAddEntry,
  planRemoveEntry,
  type MealId,
  type RecipeSummary,
} from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, Vibration, View } from 'react-native';

import { MEAL_ICONS } from '@/components/category-style';
import { Icon, type IconName } from '@/components/icon';
import { RecipeCover } from '@/components/recipe-photo';
import { Snackbar, type SnackbarMessage } from '@/components/snackbar';
import { Button, Chip, EmptyState, IconButton, SearchField } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useActiveMeals, useAppTables, useToday } from '@/data/tables';
import { colors, fonts, radius, shadows, spacing, tones } from '@/theme';

/** Mindestbreite einer Karte; auf breiten Bildschirmen passen mehr Spalten nebeneinander. */
const MIN_CARD_WIDTH = 160;
/** Höhe der Knöpfe am Fuß der Seite, ungefähr */
const FOOTER_HEIGHT = 76;

type Filter = 'favorite' | MealId | 'none' | 'paused';

const FILTERS: { id: Filter; label: string; icon: IconName }[] = [
  { id: 'favorite', label: 'Favoriten', icon: 'favorite' },
  ...MEALS.map((meal) => ({ id: meal.id, label: meal.label, icon: MEAL_ICONS[meal.id] })),
  { id: 'none', label: 'Beilagen & Co.', icon: 'restaurant' },
  { id: 'paused', label: 'Pausiert', icon: 'snooze' },
];

function matches(recipe: RecipeSummary, filter: Filter, today: string): boolean {
  if (filter === 'favorite') return recipe.favorite;
  if (filter === 'paused') return isRecipePaused(recipe, today);
  if (filter === 'none') return recipe.mealsBy !== '' && recipe.meals.length === 0;
  return recipe.meals.includes(filter);
}

type RecipeCardProps = { recipe: RecipeSummary; width: number; onLongPress: () => void };

function RecipeCard({ recipe, width, onLongPress }: RecipeCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityActions={[{ name: 'longpress', label: 'Am nächsten freien Tag einplanen' }]}
      onAccessibilityAction={(event) => event.nativeEvent.actionName === 'longpress' && onLongPress()}
      onPress={() => router.push(`/recipes/${recipe.id}`)}
      delayLongPress={400}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}>
      <View>
        <RecipeCover photoId={recipe.photo} title={recipe.title} />
        {recipe.favorite ? (
          <View style={styles.favorite}>
            <Icon name="favorite" size={16} color={tones.rose.foreground} />
          </View>
        ) : null}
      </View>
      <View style={styles.cardText}>
        <Text style={styles.title} numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={styles.metaRow}>
          {recipe.totalMinutes !== null ? (
            <View style={styles.meta}>
              <Icon name="schedule" size={15} color={colors.textMuted} />
              <Text style={styles.metaText}>{formatDuration(recipe.totalMinutes)}</Text>
            </View>
          ) : null}
          <View style={styles.meta}>
            <Icon name="group" size={15} color={colors.textMuted} />
            <Text style={styles.metaText}>{recipe.servings}</Text>
          </View>
        </View>
        {recipe.optionNames.length > 0 ? (
          <View style={styles.meta}>
            <Icon name="alt_route" size={15} color={colors.primary} />
            <Text style={[styles.metaText, styles.options]} numberOfLines={1}>
              {recipe.optionNames.join(' / ')}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function RecipeListScreen() {
  const store = useStore();
  const tables = useAppTables();
  const meals = useActiveMeals();
  const today = useToday();
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const hideMessage = useCallback(() => setMessage(null), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const all = useMemo(() => listRecipes(tables), [tables]);
  const found = useMemo(() => listRecipes(tables, query), [tables, query]);
  const recipes = filter ? found.filter((recipe) => matches(recipe, filter, today)) : found;
  // Nur Filter, die etwas treffen; der gewählte bleibt, damit er sich abwählen lässt.
  const filters = FILTERS.filter((option) => option.id === filter || all.some((recipe) => matches(recipe, option.id, today)));
  // Zugeklappt bleibt nur der gewählte Filter sichtbar.
  const shownFilters = showFilters ? filters : filters.filter((option) => option.id === filter);
  const hasRecipes = Object.keys(tables.recipes).length > 0;
  const { width } = useWindowDimensions();

  /** Lange drücken: auf den nächsten freien Platz einer passenden Mahlzeit, abends ab morgen. */
  const planNext = (recipe: RecipeSummary, now: number, hour: number) => {
    if (!store) return;
    const fitting = meals.filter((meal) => recipe.meals.includes(meal.id));
    const start = hour < PLAN_FROM_TOMORROW_HOUR ? today : addDays(today, 1);
    const slot = nextFreeSlot(tables, start, (fitting.length > 0 ? fitting : meals).map((meal) => meal.id));
    if (!slot) {
      setMessage({ text: 'In den nächsten drei Monaten ist kein Tag mehr frei.' });
      return;
    }
    const { entryId, writes } = planAddEntry(tables, { ...slot, recipeId: recipe.id, text: '' }, now, createId);
    applyWrites(store, writes);
    Vibration.vibrate(15);
    const relative = formatRelativeDate(slot.date, today);
    const day = relative === formatDate(slot.date) ? relative : relative.toLocaleLowerCase('de');
    const meal = meals.length > 1 ? ` (${MEALS.find((option) => option.id === slot.meal)?.label})` : '';
    setMessage({
      text: `„${recipe.title}“ für ${day}${meal} eingeplant`,
      action: { label: 'Rückgängig', onPress: () => applyWrites(store, planRemoveEntry(entryId, now)) },
    });
  };
  const columns = Math.max(2, Math.floor((width - spacing.lg * 2 + spacing.md) / (MIN_CARD_WIDTH + spacing.md)));
  const cardWidth = (width - spacing.lg * 2 - spacing.md * (columns - 1)) / columns;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Rezepte' }} />
      <FlatList
        key={columns}
        data={recipes}
        numColumns={columns}
        keyExtractor={(recipe) => recipe.id}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          hasRecipes ? (
            <View style={styles.header}>
              <SearchField
                accessibilityLabel="Rezepte durchsuchen"
                value={query}
                onChangeText={setQuery}
                placeholder="Suchen nach Titel oder Zutat"
                action={
                  filters.length > 1 || filter ? (
                    <IconButton
                      icon="tune"
                      variant={showFilters || filter ? 'secondary' : 'muted'}
                      size={32}
                      accessibilityLabel={showFilters ? 'Filter ausblenden' : 'Filter zeigen'}
                      onPress={() => setShowFilters(!showFilters)}
                    />
                  ) : null
                }
              />
              {shownFilters.length > 0 ? (
                <View style={styles.filters}>
                  {shownFilters.map((option) => (
                    <Chip
                      key={option.id}
                      icon={option.icon}
                      label={option.label}
                      selected={filter === option.id}
                      onPress={() => setFilter(filter === option.id ? null : option.id)}
                    />
                  ))}
                </View>
              ) : null}
              <Text style={styles.count}>
                {query || filter ? `${recipes.length} Treffer` : `${recipes.length} ${recipes.length === 1 ? 'Rezept' : 'Rezepte'}`}
                <Text style={styles.countHint}> · lange drücken zum Einplanen</Text>
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <RecipeCard recipe={item} width={cardWidth} onLongPress={() => planNext(item, Date.now(), new Date().getHours())} />
        )}
        ListEmptyComponent={
          hasRecipes && (query || filter) ? (
            <EmptyState icon="search" title="Nichts gefunden">
              Versuch es mit einem anderen Suchbegriff.
            </EmptyState>
          ) : (
            <EmptyState icon="menu_book" title="Noch keine Rezepte">
              Importier ein Rezept aus Foto, Link oder Text, oder gib eins selbst ein.
            </EmptyState>
          )
        }
      />
      <View style={styles.footer}>
        <View style={styles.footerButton}>
          <Button icon="auto_awesome" title="Importieren" onPress={() => router.push('/recipes/import')} />
        </View>
        <View style={styles.footerButton}>
          <Button variant="secondary" title="Selbst eingeben" onPress={() => router.push('/recipes/new')} />
        </View>
      </View>
      {/* Über den Knöpfen am Fuß */}
      <Snackbar message={message} onHide={hideMessage} bottom={FOOTER_HEIGHT + spacing.sm} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
  row: { gap: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  count: { fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.3 },
  countHint: { fontWeight: '400', letterSpacing: 0 },
  card: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  favorite: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: tones.rose.background,
  },
  cardText: { padding: spacing.md, paddingTop: spacing.sm + 2, gap: spacing.xs + 2 },
  title: { fontFamily: fonts.display, fontSize: 16.5, lineHeight: 21, color: colors.text },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: colors.textMuted },
  options: { flexShrink: 1, color: colors.primary, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButton: { flex: 1 },
});
