import {
  formatDate,
  isRecipePaused,
  mealLabel,
  PAUSE_OPTIONS,
  PAUSED_FOREVER,
  pauseRecipe,
  resumeRecipe,
  type RecipeView,
  type RowWrite,
} from '@zauberjournal/core';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useToday } from '@/data/tables';
import { colors, spacing, tones } from '@/theme';

import { MEAL_ICONS } from './category-style';
import { Button, Card, CardHeader, Chip, Tag } from './ui';

/** „Pausiert …“ für Rezepte, die gerade nicht vorgeschlagen werden */
export function pauseText(pausedUntil: string): string {
  return pausedUntil === PAUSED_FOREVER ? 'Pausiert bis auf Weiteres' : `Pausiert, ab ${formatDate(pausedUntil)} wieder dabei`;
}

/** Wozu ein Rezept passt und ob es vorgeschlagen wird; hier lässt es sich für die Vorschläge pausieren. */
export function RecipePlanCard({ view }: { view: RecipeView }) {
  const store = useStore();
  const today = useToday();
  const [choosing, setChoosing] = useState(false);
  const paused = isRecipePaused(view, today);
  const write = (writes: RowWrite[]) => {
    if (store) applyWrites(store, writes);
    setChoosing(false);
  };

  return (
    <Card>
      <CardHeader icon="calendar_month" title="Für den Plan" />
      <View style={styles.tags}>
        {!view.mealsBy ? (
          <Text style={styles.muted}>Wozu es passt, schätzt gleich die KI.</Text>
        ) : view.meals.length === 0 ? (
          <Tag icon="restaurant" label="Beilage o. Ä., kein eigenes Gericht" />
        ) : (
          view.meals.map((meal) => <Tag key={meal} icon={MEAL_ICONS[meal]} label={mealLabel(meal)} tone={tones.green} />)
        )}
      </View>
      {choosing ? (
        <View style={styles.choose}>
          <Text style={styles.text}>Wie lange nicht vorschlagen?</Text>
          <View style={styles.tags}>
            {PAUSE_OPTIONS.map((option) => (
              <Chip key={option.label} label={option.label} selected={false} onPress={() => write(pauseRecipe(view.id, today, option.days))} />
            ))}
          </View>
          <Button small variant="ghost" title="Abbrechen" onPress={() => setChoosing(false)} />
        </View>
      ) : paused ? (
        <View style={styles.choose}>
          <Text style={styles.text}>{pauseText(view.pausedUntil)}</Text>
          <Button small variant="secondary" icon="refresh" title="Wieder vorschlagen" onPress={() => write(resumeRecipe(view.id))} />
        </View>
      ) : (
        <Button small variant="secondary" icon="snooze" title="In den Vorschlägen pausieren" onPress={() => setChoosing(true)} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  choose: { gap: spacing.sm },
  text: { fontSize: 15, lineHeight: 21, color: colors.text },
  muted: { fontSize: 15, lineHeight: 21, color: colors.textMuted },
});
