import { formatPrice, reweImageUrl, type ReweOrderStatus, type ShoppingItemRewe } from '@zauberjournal/core';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, tones, type Tone } from '@/theme';

import { Icon } from './icon';
import { CountControl } from './ui';

/** Produktbild von REWE, verkleinert; die Fotos haben weißen Grund. */
export function ReweImage({ url, size }: { url: string; size: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = url && failedUrl !== url ? reweImageUrl(url, size <= 40 ? 120 : 240) : '';
  return (
    <View aria-hidden style={[styles.image, { width: size, height: size, borderRadius: Math.round(size * 0.22) }]}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={120}
          recyclingKey={url}
          alt=""
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <Icon name="grocery" size={Math.round(size * 0.55)} color={colors.textMuted} />
      )}
    </View>
  );
}

/** Markierung hinter dem Produkt: Vorschlag zum Prüfen oder Ersatz für die erste Wahl. */
function lineTag(rewe: ShoppingItemRewe): { label: string; tone: Tone } | null {
  if (rewe.state === 'unsure' || rewe.state === 'missing') return { label: 'prüfen', tone: tones.ochre };
  if (rewe.rank !== null && rewe.rank > 1) return { label: 'Ersatz', tone: tones.teal };
  return null;
}

const CART_LABELS: Record<ReweOrderStatus, string> = {
  pending: '',
  added: 'im Warenkorb',
  present: 'im Warenkorb',
  failed: 'nicht in den Warenkorb gekommen',
};

type ReweProductLineProps = {
  rewe: ShoppingItemRewe;
  onPress: () => void;
  /** Was das Userscript mit dem Produkt gemacht hat. */
  cart?: ReweOrderStatus;
  /** Eine Packung mehr (1) oder weniger (−1). */
  onStepPacks: (delta: 1 | -1) => void;
  /** Bei einer Packung wird aus „weniger“ das Entfernen der Position. */
  onRemove?: () => void;
};

/** Das REWE-Produkt unter einer Position der Einkaufsliste; Antippen öffnet die Auswahl, daneben die Packungen. */
export function ReweProductLine({ rewe, onPress, cart = 'pending', onStepPacks, onRemove }: ReweProductLineProps) {
  if (rewe.state === 'skip' || rewe.state === 'none' || !rewe.productId) {
    const skipped = rewe.state === 'skip';
    const label = skipped ? 'Nicht bei REWE' : 'Kein Produkt gefunden';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. Produkt wählen`}
        onPress={onPress}
        style={({ pressed }) => [styles.line, pressed && styles.pressed]}>
        <Icon name={skipped ? 'remove_shopping_cart' : 'search_off'} size={18} color={skipped ? colors.textMuted : tones.ochre.foreground} />
        <Text style={[styles.name, styles.muted]} numberOfLines={1}>
          {label}
        </Text>
        {skipped ? null : <Text style={styles.choose}>wählen</Text>}
        <Icon name="chevron_right" size={18} color={colors.textMuted} />
      </Pressable>
    );
  }

  const tag = lineTag(rewe);
  const total = formatPrice(rewe.packs * rewe.price);
  const details = [rewe.packs > 1 ? `${rewe.packs}× ${rewe.name}` : rewe.name, total, tag?.label, CART_LABELS[cart]];
  const last = rewe.packs <= 1;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`REWE: ${details.filter(Boolean).join(', ')}. Ändern`}
        onPress={onPress}
        style={({ pressed }) => [styles.line, styles.product, pressed && styles.pressed]}>
        <ReweImage url={rewe.imageUrl} size={30} />
        <View style={styles.text}>
          <Text style={styles.productName} numberOfLines={2}>
            {rewe.name}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.price}>{total}</Text>
            {tag ? (
              <View style={[styles.tag, { backgroundColor: tag.tone.background }]}>
                <Text style={[styles.tagText, { color: tag.tone.foreground }]}>{tag.label}</Text>
              </View>
            ) : null}
            {cart === 'added' || cart === 'present' ? <Icon name="shopping_cart" size={16} color={colors.primary} /> : null}
            {cart === 'failed' ? <Icon name="error" size={16} color={colors.danger} /> : null}
          </View>
        </View>
        <Icon name="chevron_right" size={18} color={colors.textMuted} />
      </Pressable>
      <CountControl
        small
        label={`${rewe.name}, Packungen`}
        value={rewe.packs}
        canDecrease={!last || !!onRemove}
        decrease={last && onRemove ? { icon: 'delete', label: `${rewe.name} entfernen` } : undefined}
        onDecrease={() => (last ? onRemove?.() : onStepPacks(-1))}
        onIncrease={() => onStepPacks(1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: '#FFFFFF',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: spacing.xs,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.background,
  },
  product: { flex: 1 },
  pressed: { opacity: 0.6 },
  name: { flex: 1, fontSize: 13.5, color: colors.text },
  text: { flex: 1, gap: 1 },
  productName: { fontSize: 13.5, lineHeight: 18, color: colors.text },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs + 2 },
  muted: { color: colors.textMuted },
  choose: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  tagText: { fontSize: 12, fontWeight: '700' },
  price: { fontSize: 13.5, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
