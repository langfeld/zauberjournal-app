import type { IngredientDisplay } from '@zauberjournal/core';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme';

/** Zutaten in zwei Spalten: Menge mit Einheit links, Name und Zusatz rechts. */
export function IngredientRows({ items }: { items: IngredientDisplay[] }) {
  return (
    <View>
      {items.map((item, index) =>
        item.kind === 'heading' ? (
          <Text key={item.id} style={[styles.heading, index === 0 && styles.first]}>
            {item.name}
          </Text>
        ) : (
          <View key={item.id} style={[styles.row, index > 0 && items[index - 1]?.kind !== 'heading' && styles.divider]}>
            <Text style={styles.amount}>{[item.amount, item.unit].filter(Boolean).join(' ')}</Text>
            <Text style={styles.name}>
              {item.name}
              {item.note ? <Text style={styles.note}>, {item.note}</Text> : null}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: fonts.display, fontSize: 17, lineHeight: 23, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs },
  first: { marginTop: 0 },
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm + 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  amount: { width: 84, textAlign: 'right', fontSize: 16, fontWeight: '700', color: colors.primary },
  name: { flex: 1, fontSize: 16, lineHeight: 22, color: colors.text },
  note: { color: colors.textMuted },
});
