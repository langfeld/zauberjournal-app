import type { ShoppingItemView } from '@zauberjournal/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Button } from './ui';

type ShoppingItemRowProps = {
  item: ShoppingItemView;
  onToggle: () => void;
  /** Zusätzlicher Knopf rechts, z. B. „Kaufen“ im Abschnitt „Vorrat prüfen“. */
  action?: { title: string; onPress: () => void };
  onRemove?: () => void;
};

/** Eine Position der Einkaufsliste; Antippen hakt sie ab. */
export function ShoppingItemRow({ item, onToggle, action, onRemove }: ShoppingItemRowProps) {
  const note = item.origin === 'pantry' ? 'Vorrat: nachkaufen' : item.sources;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={[item.amount, item.name].filter(Boolean).join(' ')}
        onPress={onToggle}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={[styles.box, item.checked && styles.boxChecked]}>
          {item.checked ? <Text style={styles.check}>✓</Text> : null}
        </View>
        <View style={styles.text}>
          <Text style={[styles.name, item.checked && styles.checked]}>{item.name}</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
        {item.amount ? <Text style={[styles.amount, item.checked && styles.checked]}>{item.amount}</Text> : null}
      </Pressable>
      {action ? <Button small variant="secondary" title={action.title} onPress={action.onPress} /> : null}
      {onRemove ? (
        <Button small variant="ghost" title="✕" accessibilityLabel={`${item.name} entfernen`} onPress={onRemove} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  pressed: { opacity: 0.6 },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.primary },
  check: { color: colors.primaryText, fontSize: 15, fontWeight: '700', lineHeight: 18 },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, color: colors.text },
  note: { fontSize: 12, color: colors.textMuted },
  amount: { fontSize: 15, fontWeight: '600', color: colors.text },
  checked: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
