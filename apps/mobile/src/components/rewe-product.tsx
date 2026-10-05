import { formatPrice, reweImageUrl, type ReweOrderStatus, type ShoppingItemRewe } from '@zauberjournal/core';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, tones } from '@/theme';

import { Icon } from './icon';

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

/** Wie viele Packungen, z. B. „3× Zwiebel gelb ca. 100g“. */
export function packsLabel(packs: number, name: string): string {
  return packs > 1 ? `${packs}× ${name}` : name;
}

const STATE_TAGS = {
  unsure: 'prüfen',
  missing: 'nicht gefunden',
} as const;

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
};

/** Das REWE-Produkt unter einer Position der Einkaufsliste; Antippen öffnet die Auswahl. */
export function ReweProductLine({ rewe, onPress, cart = 'pending' }: ReweProductLineProps) {
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

  const tag = rewe.state === 'unsure' || rewe.state === 'missing' ? STATE_TAGS[rewe.state] : null;
  const name = packsLabel(rewe.packs, rewe.name);
  const total = formatPrice(rewe.packs * rewe.price);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`REWE: ${name}, ${total}${tag ? `, ${tag}` : ''}${CART_LABELS[cart] ? `, ${CART_LABELS[cart]}` : ''}. Ändern`}
      onPress={onPress}
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}>
      <ReweImage url={rewe.imageUrl} size={30} />
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      {tag ? (
        <View style={styles.tag}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      ) : null}
      {cart === 'added' || cart === 'present' ? <Icon name="shopping_cart" size={16} color={colors.primary} /> : null}
      {cart === 'failed' ? <Icon name="error" size={16} color={colors.danger} /> : null}
      <Text style={styles.price}>{total}</Text>
      <Icon name="chevron_right" size={18} color={colors.textMuted} />
    </Pressable>
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
  pressed: { opacity: 0.6 },
  name: { flex: 1, fontSize: 13.5, color: colors.text },
  muted: { color: colors.textMuted },
  choose: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: tones.ochre.background },
  tagText: { fontSize: 12, fontWeight: '700', color: tones.ochre.foreground },
  price: { fontSize: 13.5, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
