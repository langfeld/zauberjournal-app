import type { ShoppingItemView } from '@zauberjournal/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Icon } from './icon';
import { Button, IconButton } from './ui';

type ShoppingItemRowProps = {
  item: ShoppingItemView;
  onToggle: () => void;
  /** Zusätzlicher Knopf rechts, z. B. „Kaufen“ im Abschnitt „Vorrat prüfen“. */
  action?: { title: string; onPress: () => void };
  onRemove?: () => void;
  /** Trennlinie über der Zeile, außer bei der ersten eines Abschnitts. */
  divider?: boolean;
};

/** Eine Position der Einkaufsliste; Antippen hakt sie ab. */
export function ShoppingItemRow({ item, onToggle, action, onRemove, divider }: ShoppingItemRowProps) {
  const note = item.origin === 'pantry' ? 'Vorrat: nachkaufen' : item.sources;
  return (
    <View style={[styles.row, divider && styles.divider]}>
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
            <Text style={styles.note} numberOfLines={1}>
              {note}
            </Text>
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, color: colors.text },
  note: { fontSize: 12.5, lineHeight: 17, color: colors.textMuted },
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
