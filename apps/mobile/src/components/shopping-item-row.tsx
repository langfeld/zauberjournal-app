import type { ReweOrderStatus, ShoppingItemDish, ShoppingItemView } from '@zauberjournal/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Icon } from './icon';
import { RecipeThumbnail } from './recipe-photo';
import { ReweProductLine } from './rewe-product';
import { Button, IconButton } from './ui';

/** So viele Gerichte zeigen ihr Foto; die Namen stehen trotzdem alle im Text daneben. */
const MAX_DISH_PHOTOS = 3;
const DISH_PHOTO_SIZE = 22;

/** Runde Fotos der Gerichte, leicht überlappend; sie passen zu den Karten oben auf der Liste. */
function DishPhotos({ dishes, dimmed }: { dishes: ShoppingItemDish[]; dimmed: boolean }) {
  return (
    <View aria-hidden style={[styles.photos, dimmed && styles.dimmed]}>
      {dishes.slice(0, MAX_DISH_PHOTOS).map((dish, index) => (
        <View key={dish.title} style={[styles.photoRing, index > 0 && styles.photoOverlap]}>
          <RecipeThumbnail photoId={dish.photo} title={dish.title} size={DISH_PHOTO_SIZE} round />
        </View>
      ))}
    </View>
  );
}

type ShoppingItemRowProps = {
  item: ShoppingItemView;
  onToggle: () => void;
  /** Zusätzlicher Knopf rechts, z. B. „Kaufen“ im Abschnitt „Vorrat prüfen“. */
  action?: { title: string; onPress: () => void };
  onRemove?: () => void;
  /** Trennlinie über der Zeile, außer bei der ersten eines Abschnitts. */
  divider?: boolean;
  /** Zeigt das REWE-Produkt der Position; Antippen öffnet die Auswahl. */
  onOpenProduct?: () => void;
  /** Was das Userscript mit dem REWE-Produkt gemacht hat. */
  cart?: ReweOrderStatus;
};

/** Eine Position der Einkaufsliste; Antippen hakt sie ab. */
export function ShoppingItemRow({ item, onToggle, action, onRemove, divider, onOpenProduct, cart }: ShoppingItemRowProps) {
  const note = item.origin === 'pantry' ? 'Vorrat: nachkaufen' : [item.fromStock, item.sources].filter(Boolean).join(' · ');
  const rewe = onOpenProduct && !item.checked ? item.rewe : null;
  return (
    <View style={divider && styles.divider}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={[item.amount, item.name].filter(Boolean).join(' ')}
          onPress={onToggle}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
          <View style={[styles.box, item.checked && styles.boxChecked]}>
            {item.checked ? <Icon name="check" size={16} color={colors.primaryText} /> : null}
          </View>
          <View style={styles.text}>
            <Text style={[styles.name, item.checked && styles.checked]}>{item.name}</Text>
            {note ? (
              <View style={styles.noteRow}>
                {item.dishes.length > 0 ? <DishPhotos dishes={item.dishes} dimmed={item.checked} /> : null}
                <Text style={styles.note} numberOfLines={1}>
                  {note}
                </Text>
              </View>
            ) : null}
          </View>
          {item.amount ? (
            <Text style={[styles.amount, item.checked && styles.amountChecked]}>{item.amount}</Text>
          ) : null}
        </Pressable>
        {action ? <Button small variant="secondary" icon="add_shopping_cart" title={action.title} onPress={action.onPress} /> : null}
        {onRemove ? (
          <IconButton icon="close" variant="muted" size={34} accessibilityLabel={`${item.name} entfernen`} onPress={onRemove} />
        ) : null}
      </View>
      {rewe && onOpenProduct ? (
        <View style={styles.product}>
          <ReweProductLine rewe={rewe} onPress={onOpenProduct} cart={cart} />
        </View>
      ) : null}
    </View>
  );
}

/** Abstand vom Rand bis zum Namen: Kreis zum Abhaken und Lücke. */
const TEXT_INSET = 26 + spacing.md;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  product: { marginLeft: TEXT_INSET, marginTop: -2, marginBottom: spacing.sm + 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  pressed: { opacity: 0.6 },
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
  text: { flex: 1, gap: 3 },
  name: { fontSize: 16, color: colors.text },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  note: { flexShrink: 1, fontSize: 12.5, lineHeight: 17, color: colors.textMuted },
  photos: { flexDirection: 'row' },
  // Der helle Ring trennt die überlappenden Fotos voneinander.
  photoRing: { borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.surface, backgroundColor: colors.surface },
  photoOverlap: { marginLeft: -8 },
  dimmed: { opacity: 0.5 },
  amount: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surfaceSunken,
  },
  amountChecked: { color: colors.textMuted, textDecorationLine: 'line-through' },
  checked: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
