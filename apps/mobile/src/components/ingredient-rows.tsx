import type { IngredientDisplay } from '@zauberjournal/core';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';

/** Zutaten in zwei Spalten: Menge mit Einheit links, Name und Zusatz rechts. */
export function IngredientRows({ items }: { items: IngredientDisplay[] }) {
  return (
    <View style={styles.list}>
      {items.map((item) =>
        item.kind === 'heading' ? (
          <Text key={item.id} style={styles.heading}>
            {item.name}
          </Text>
        ) : (
          <View key={item.id} style={styles.row}>
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
  list: { gap: spacing.sm },
  heading: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  amount: { width: 84, textAlign: 'right', fontSize: 16, fontWeight: '600', color: colors.text },
  name: { flex: 1, fontSize: 16, color: colors.text },
  note: { color: colors.textMuted },
});
