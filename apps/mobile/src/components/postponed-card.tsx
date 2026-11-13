import { formatRelativeDate, mealLabel, type PostponedEntry } from '@zauberjournal/core';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing, tones } from '@/theme';

import { Button, Card, CardHeader, Hint } from './ui';

type PostponedCardProps = {
  entries: readonly (PostponedEntry & { title: string })[];
  today: string;
  /** Mit mehreren Mahlzeiten steht die Mahlzeit dabei. */
  showMeal: boolean;
  onCooked: (entryId: string) => void;
  onKeep: () => void;
};

/**
 * Meldung im Plan: Gerichte, die von selbst weitergerückt sind, weil niemand sie als gekocht eingetragen hat.
 * „Doch gekocht“ nimmt das zurück, „Passt so“ blendet die Meldung aus.
 */
export function PostponedCard({ entries, today, showMeal, onCooked, onKeep }: PostponedCardProps) {
  return (
    <Card>
      <CardHeader icon="event_upcoming" title="Weitergerückt" tone={tones.ochre} />
      <Hint>
        {entries.length === 1
          ? 'Nicht als gekocht eingetragen. Die Gerichte danach sind je einen Tag mitgerückt, bis zum nächsten freien Tag.'
          : 'Nicht als gekocht eingetragen. Die Gerichte danach sind mitgerückt, bis zu den nächsten freien Tagen.'}
      </Hint>
      {entries.map((entry) => {
        const move = `${formatRelativeDate(entry.from, today)} → ${formatRelativeDate(entry.date, today)}`;
        return (
          <View key={entry.id} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.dish} numberOfLines={2}>
                {entry.title}
              </Text>
              <Text style={styles.move}>{showMeal ? `${move} · ${mealLabel(entry.meal)}` : move}</Text>
            </View>
            <Button
              small
              variant="secondary"
              icon="task_alt"
              title="Doch gekocht"
              accessibilityLabel={`„${entry.title}“ doch gekocht, am ${formatRelativeDate(entry.from, today)}`}
              onPress={() => onCooked(entry.id)}
            />
          </View>
        );
      })}
      <View style={styles.footer}>
        <Button small variant="ghost" icon="check" title="Passt so" onPress={onKeep} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  rowText: { flex: 1, gap: 2 },
  dish: { fontFamily: fonts.display, fontSize: 16.5, lineHeight: 21, color: colors.text },
  move: { fontSize: 13, color: colors.textMuted },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginRight: -spacing.sm },
});
