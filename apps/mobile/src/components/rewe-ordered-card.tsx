import { formatPickup, type ReweOrderSummary } from '@zauberjournal/core';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing, tones } from '@/theme';

import { Button, Card, Hint, IconCircle } from './ui';

type ReweOrderedCardProps = {
  summary: ReweOrderSummary;
  /** Bestellte Produkte, die zu keinem Lebensmittel gehören; leer, solange der Auftrag nicht geladen ist. */
  extras: string[];
  today: string;
  onUndo: () => void;
};

/** Meldung im Einkauf, nachdem die App eine Bestellung bei REWE übernommen hat; bis zum Tag der Abholung. */
export function ReweOrderedCard({ summary, extras, today, onUndo }: ReweOrderedCardProps) {
  const pickup = formatPickup(summary.pickupStart, summary.pickupEnd, today);
  const { ordered, moved } = summary;
  return (
    <Card>
      <View style={styles.header}>
        <IconCircle icon="shopping_bag" tone={tones.green} size={40} />
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={styles.title}>
            Bei REWE bestellt
          </Text>
          <Text style={styles.subtitle}>{pickup ? `Abholung ${pickup}` : `Bestellnummer ${summary.orderId}`}</Text>
        </View>
      </View>
      <Hint>
        {`${ordered} ${ordered === 1 ? 'Position' : 'Positionen'} bestellt. Die Liste ist abgeschlossen, der Vorrat gebucht.`}
      </Hint>
      {moved > 0 ? (
        <Hint>
          {`${moved} ${moved === 1 ? 'Position fehlte und steht' : 'Positionen fehlten und stehen'} jetzt auf „${summary.movedTo}“.`}
        </Hint>
      ) : null}
      {extras.length > 0 ? <Hint>{`Außerdem bestellt: ${extras.join(', ')}`}</Hint> : null}
      <Button small variant="ghost" icon="undo" title="Rückgängig" onPress={onUndo} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1, gap: 1 },
  title: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.text },
  subtitle: { fontSize: 13.5, color: colors.textMuted },
});
