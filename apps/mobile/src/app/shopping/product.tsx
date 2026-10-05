import {
  buildShoppingListView,
  chooseReweProduct,
  confirmReweProduct,
  forgetReweFavorite,
  formatPrice,
  matchReweProducts,
  moveReweFavorite,
  packsFor,
  parsePackSize,
  reweFavoritesOf,
  reweSearchTerm,
  setRewePacks,
  skipRewe,
  type ReweCandidate,
  type ReweFavorite,
  type ReweProduct,
  type RowWrite,
  type ShoppingItemRewe,
} from '@zauberjournal/core';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ReweImage } from '@/components/rewe-product';
import { Button, Card, Hint, IconButton, Notice, SectionTitle, Stepper, Tag, TextField } from '@/components/ui';
import { searchReweProducts } from '@/data/api';
import { useConnection } from '@/data/connection';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useAppTables, useReweSettings } from '@/data/tables';
import { errorMessage } from '@/lib/error-message';
import { colors, fonts, spacing, tones, type Tone } from '@/theme';

/** Merkmale aus der REWE-Suche, die bei der Wahl helfen. */
const PRODUCT_TAGS: { id: string; label: string; icon?: IconName; tone: Tone }[] = [
  { id: 'organic', label: 'Bio', icon: 'eco', tone: tones.green },
  { id: 'discounted', label: 'Angebot', icon: 'sell', tone: tones.terracotta },
  { id: 'lowestprice', label: 'Tiefpreis', tone: tones.ochre },
  { id: 'regional', label: 'Regional', tone: tones.teal },
  { id: 'vegan', label: 'Vegan', tone: tones.olive },
];

type Place = 'first' | 'fallback';

/** Hinweis, wenn der Abgleich keins der gemerkten Produkte gefunden hat. */
function missingText(count: number): string {
  return count === 1 ? 'Das gemerkte Produkt gibt es gerade nicht.' : 'Die gemerkten Produkte gibt es gerade nicht.';
}

type CurrentLabel = { label: string; icon: IconName; tone: Tone; detail?: string };

/** Woher das Produkt für diesen Einkauf kommt; `favorites`: Zahl der gemerkten Produkte. */
function currentLabel(rewe: ShoppingItemRewe, favorites: number): CurrentLabel | null {
  if (rewe.rank === 1) return { label: 'Gemerkt, 1. Wahl', icon: 'bookmark', tone: tones.green };
  if (rewe.rank !== null) return { label: `Ersatz, ${rewe.rank}. Wahl`, icon: 'alt_route', tone: tones.teal };
  switch (rewe.state) {
    case 'sure':
      return { label: 'Vorschlag', icon: 'check_circle', tone: tones.green };
    case 'unsure':
      return { label: 'Vorschlag, bitte prüfen', icon: 'warning', tone: tones.ochre };
    case 'missing':
      return { label: 'Vorschlag, bitte prüfen', icon: 'warning', tone: tones.ochre, detail: missingText(favorites) };
    default:
      return null;
  }
}

/** Packungsangabe ohne Grundpreis, z. B. „1,5kg“. */
function packOnly(grammage: string): string {
  return grammage.split('(')[0]!.trim();
}

function FavoriteRow({
  favorite,
  rank,
  divider,
  onMoveUp,
  onForget,
}: {
  favorite: ReweFavorite;
  rank: number;
  divider: boolean;
  onMoveUp: (productId: string) => void;
  onForget: (productId: string) => void;
}) {
  const meta = [`${rank}. Wahl`, formatPrice(favorite.price), packOnly(favorite.grammage)].filter(Boolean).join(' · ');
  return (
    <View style={[styles.favorite, divider && styles.divider]}>
      <ReweImage url={favorite.imageUrl} size={40} />
      <View style={styles.productText}>
        <Text style={styles.favoriteName} numberOfLines={2}>
          {favorite.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <IconButton
        icon="arrow_upward"
        variant="muted"
        size={36}
        accessibilityLabel={`${favorite.name} nach oben`}
        disabled={rank === 1}
        onPress={() => onMoveUp(favorite.productId)}
      />
      <IconButton
        icon="close"
        variant="muted"
        size={36}
        accessibilityLabel={`${favorite.name} vergessen`}
        onPress={() => onForget(favorite.productId)}
      />
    </View>
  );
}

function CandidateRow({
  candidate,
  selected,
  rank,
  divider,
  expanded,
  onPress,
  onPick,
}: {
  candidate: ReweCandidate;
  selected: boolean;
  /** Platz unter den gemerkten Produkten, falls es dazugehört. */
  rank: number | null;
  divider: boolean;
  /** Zeigt die Knöpfe zum Merken als erste Wahl oder als Ersatz. */
  expanded: boolean;
  onPress: (product: ReweProduct) => void;
  onPick: (product: ReweProduct, place: Place) => void;
}) {
  const tags = PRODUCT_TAGS.filter((tag) => candidate.tags.includes(tag.id));
  return (
    <View style={divider && styles.divider}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected, expanded }}
        accessibilityLabel={`${candidate.name}, ${formatPrice(candidate.price)}${rank ? `, gemerkt als ${rank}. Wahl` : ''}`}
        onPress={() => onPress(candidate)}
        style={({ pressed }) => [styles.candidate, pressed && styles.pressed]}>
        <ReweImage url={candidate.imageUrl} size={56} />
        <View style={styles.productText}>
          <Text style={styles.candidateName} numberOfLines={2}>
            {candidate.name}
          </Text>
          {candidate.grammage ? (
            <Text style={styles.meta} numberOfLines={1}>
              {candidate.grammage}
            </Text>
          ) : null}
          {rank || tags.length > 0 ? (
            <View style={styles.tags}>
              {rank ? <Tag label={`${rank}. Wahl`} icon="bookmark" tone={tones.green} /> : null}
              {tags.map((tag) => (
                <Tag key={tag.id} label={tag.label} icon={tag.icon} tone={tag.tone} />
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.priceColumn}>
          <Text style={styles.price}>{formatPrice(candidate.price)}</Text>
          {candidate.packs > 1 ? <Text style={styles.meta}>{`×${candidate.packs} = ${formatPrice(candidate.total)}`}</Text> : null}
          {selected ? <Icon name="check_circle" size={20} color={colors.primary} /> : null}
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.pickActions}>
          <Button small variant="secondary" icon="bookmark" title="Als 1. Wahl" onPress={() => onPick(candidate, 'first')} />
          <Button small variant="secondary" icon="alt_route" title="Als Ersatz" onPress={() => onPick(candidate, 'fallback')} />
        </View>
      ) : null}
    </View>
  );
}

type SearchRound = { term: string; round: number };
type SearchResult = { round: number; products: ReweProduct[]; error: string | null };

/**
 * Produkt für eine Position der Einkaufsliste wählen. Gewählte Produkte merkt sich die App je Lebensmittel
 * in einer Reihenfolge; beim Abgleich nimmt sie das erste, das REWE gerade hat.
 */
export default function ReweProductScreen() {
  const { item: itemId = '' } = useLocalSearchParams<{ item?: string }>();
  const store = useStore();
  const tables = useAppTables();
  const { credentials } = useConnection();
  const settings = useReweSettings();

  const row = tables.shoppingItems[itemId];
  const food = row ? tables.foods[row.foodId] : undefined;
  const foodName = food?.name || row?.name || '';
  const category = food?.category ?? 'other';
  const amount = row?.amount ?? null;
  const unit = row?.unit ?? '';
  const listId = row?.listId ?? '';
  const foodId = row?.foodId ?? '';
  const marketId = settings.marketId;

  const view = useMemo(() => (listId ? buildShoppingListView(tables, listId) : undefined), [tables, listId]);
  const item = view
    ? [...view.sections.flatMap((section) => section.items), ...view.pantry, ...view.done].find((entry) => entry.id === itemId)
    : undefined;
  const favorites = useMemo(() => (foodId ? reweFavoritesOf(tables, foodId) : []), [tables, foodId]);
  const ranks = useMemo(() => new Map(favorites.map((favorite, index) => [favorite.productId, index + 1])), [favorites]);

  const [query, setQuery] = useState(() => reweSearchTerm(foodName).term);
  const [search, setSearch] = useState<SearchRound>(() => ({ term: reweSearchTerm(foodName).term, round: 0 }));
  const [result, setResult] = useState<SearchResult | null>(null);
  /** Suchergebnis, unter dem die Knöpfe „Als 1. Wahl“ und „Als Ersatz“ stehen. */
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    if (!credentials || !marketId || !search.term) return;
    const controller = new AbortController();
    searchReweProducts(credentials, search.term, marketId, controller.signal).then(
      (products) => setResult({ round: search.round, products, error: null }),
      (problem: unknown) => {
        if (!controller.signal.aborted) setResult({ round: search.round, products: [], error: errorMessage(problem) });
      },
    );
    return () => controller.abort();
  }, [credentials, marketId, search]);

  const candidates = useMemo(
    () =>
      result
        ? matchReweProducts({ name: search.term, category, amount, unit }, result.products, { organic: settings.organic, limit: 30 })
            .candidates
        : [],
    [result, search.term, category, amount, unit, settings.organic],
  );

  if (!row || !item) return <Redirect href="/shopping" />;

  const canSearch = !!credentials && !!marketId;
  const loading = canSearch && !!search.term && result?.round !== search.round;
  const rewe = item.rewe;
  const current = rewe && rewe.productId && rewe.state !== 'none' && rewe.state !== 'skip' ? rewe : null;
  const label = current ? currentLabel(current, favorites.length) : null;
  const computedPacks = current ? packsFor(amount, unit, parsePackSize(current.grammage, current.name), category) : 1;
  const need = [item.amount, item.origin === 'pantry' ? 'Vorrat: nachkaufen' : item.sources ? `für ${item.sources}` : '']
    .filter(Boolean)
    .join(' · ');

  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };
  const pick = (product: ReweProduct, place: Place) => {
    write(chooseReweProduct(tables, itemId, product, place, Date.now()));
    router.back();
  };
  // Ist noch nichts gemerkt, wird das Produkt gleich zur ersten Wahl.
  const pressCandidate = (product: ReweProduct) => {
    if (favorites.length === 0) pick(product, 'first');
    else setPicking((previous) => (previous === product.id ? null : product.id));
  };
  const moveUp = (productId: string) => write(moveReweFavorite(tables, foodId, productId, -1));
  const forget = (productId: string) => write(forgetReweFavorite(tables, foodId, productId, Date.now()));
  const confirm = () => {
    write(confirmReweProduct(tables, itemId, Date.now()));
    router.back();
  };
  const skip = () => {
    write(skipRewe(tables, itemId, Date.now()));
    router.back();
  };
  // Stimmt die Zahl wieder mit der Menge überein, gilt sie als berechnet.
  const changePacks = (packs: number) => write(setRewePacks(itemId, packs === computedPacks ? null : packs));
  const submit = () => {
    const term = query.trim();
    if (term) setSearch((previous) => ({ term, round: previous.round + 1 }));
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Produkt wählen' }} />
      <View style={styles.need}>
        <Text accessibilityRole="header" style={styles.needName}>
          {item.name}
        </Text>
        {need ? <Text style={styles.meta}>{need}</Text> : null}
      </View>

      {rewe?.state === 'missing' && !current ? (
        <Notice tone="warning">{`${missingText(favorites.length)} Wähle unten ein anderes.`}</Notice>
      ) : null}

      {current ? (
        <Card>
          {label ? (
            <View style={styles.currentLabel}>
              <Icon name={label.icon} size={18} color={label.tone.foreground} />
              <View style={styles.productText}>
                <Text style={[styles.currentLabelText, { color: label.tone.foreground }]}>{label.label}</Text>
                {label.detail ? <Text style={styles.meta}>{label.detail}</Text> : null}
              </View>
            </View>
          ) : null}
          <View style={styles.product}>
            <ReweImage url={current.imageUrl} size={64} />
            <View style={styles.productText}>
              <Text style={styles.productName}>{current.name}</Text>
              {current.grammage ? <Text style={styles.meta}>{current.grammage}</Text> : null}
              <Text style={styles.meta}>{`${formatPrice(current.price)} je Packung`}</Text>
            </View>
          </View>
          <Stepper
            icon="shopping_basket"
            label="Packungen"
            value={current.packs}
            canDecrease={current.packs > 1}
            onDecrease={() => changePacks(current.packs - 1)}
            onIncrease={() => changePacks(current.packs + 1)}
          />
          <View style={styles.sumRow}>
            {current.manualPacks ? (
              <Button small variant="ghost" title="Wie berechnet" onPress={() => changePacks(computedPacks)} />
            ) : (
              <Text style={styles.meta}>Passend zur Menge</Text>
            )}
            <Text style={styles.sum}>{`Zusammen ${formatPrice(current.packs * current.price)}`}</Text>
          </View>
          {current.rank === null ? (
            <Button icon="bookmark" title={favorites.length > 0 ? 'Als Ersatz merken' : 'Passt, merken'} onPress={confirm} />
          ) : null}
        </Card>
      ) : null}

      {favorites.length > 0 ? (
        <>
          <SectionTitle>Gemerkt</SectionTitle>
          <Card style={styles.list}>
            {favorites.map((favorite, index) => (
              <FavoriteRow
                key={favorite.productId}
                favorite={favorite}
                rank={index + 1}
                divider={index > 0}
                onMoveUp={moveUp}
                onForget={forget}
              />
            ))}
          </Card>
          <Hint>Beim nächsten Abgleich nimmt die App das erste, das REWE gerade hat.</Hint>
        </>
      ) : null}

      <SectionTitle>{current ? 'Anderes Produkt' : 'Produkt suchen'}</SectionTitle>
      {canSearch ? (
        <>
          <TextField
            round
            icon="search"
            accessibilityLabel="Bei REWE suchen"
            value={query}
            onChangeText={setQuery}
            placeholder="Bei REWE suchen"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={submit}
            trailing={<IconButton icon="search" variant="primary" size={36} accessibilityLabel="Suchen" onPress={submit} />}
          />
          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : result?.error ? (
            <Notice tone="danger">{result.error}</Notice>
          ) : candidates.length === 0 ? (
            <Hint>Nichts gefunden. Versuch es mit einem anderen Wort.</Hint>
          ) : (
            <Card style={styles.list}>
              {candidates.map((candidate, index) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  selected={candidate.id === current?.productId}
                  rank={ranks.get(candidate.id) ?? null}
                  divider={index > 0}
                  expanded={picking === candidate.id && favorites.length > 0}
                  onPress={pressCandidate}
                  onPick={pick}
                />
              ))}
            </Card>
          )}
        </>
      ) : (
        <Notice>Die Suche braucht die Verbindung zum Haushalt und einen REWE-Markt.</Notice>
      )}

      <View style={styles.footer}>
        {rewe?.state === 'skip' ? (
          <Hint>Wird nicht bei REWE gekauft. Wähle ein Produkt, um es wieder mitzubestellen.</Hint>
        ) : (
          <Button variant="ghost" icon="remove_shopping_cart" title="Nicht bei REWE kaufen" onPress={skip} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  need: { gap: 2 },
  needName: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  meta: { fontSize: 13.5, lineHeight: 19, color: colors.textMuted },
  currentLabel: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs + 2 },
  currentLabelText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  product: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  productText: { flex: 1, gap: 2 },
  productName: { fontSize: 16, fontWeight: '600', color: colors.text },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 36 },
  sum: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  loading: { marginVertical: spacing.lg },
  list: { paddingVertical: spacing.xs, gap: 0 },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  pickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.md },
  favorite: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2 },
  favoriteName: { fontSize: 15, lineHeight: 20, color: colors.text },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  candidateName: { fontSize: 15, lineHeight: 20, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  priceColumn: { alignItems: 'flex-end', gap: 2 },
  price: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  footer: { marginTop: spacing.md, alignItems: 'center' },
});
