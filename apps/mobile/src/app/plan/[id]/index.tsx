import {
  addDays,
  buildPlanEntry,
  createDietLookup,
  formatDate,
  listMembers,
  mealLabel,
  PLAN_STATUS_LABELS,
  planChoose,
  planRemoveEntry,
  planSetServings,
  planSetStatus,
  planUpdateEntry,
  removeCookedBookings,
  type EaterView,
  type PlanEntryView,
  type PlanStatus,
  type RecipeView,
  type RowWrite,
} from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MEAL_ICONS } from '@/components/category-style';
import type { IconName } from '@/components/icon';
import { NotFound } from '@/components/not-found';
import { PlanEntryNutrition } from '@/components/nutrition';
import { RecipeBody } from '@/components/recipe-body';
import { RecipePhoto } from '@/components/recipe-photo';
import {
  Button,
  Card,
  Chip,
  Hint,
  IconButton,
  Notice,
  SectionTitle,
  Segmented,
  Stepper,
  TextField,
} from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useActiveMeals, useAppTables, useToday } from '@/data/tables';
import { confirm } from '@/lib/confirm';
import { colors, fonts, radius, spacing } from '@/theme';

const STATUS_ICONS: Record<PlanStatus, IconName> = { planned: 'event', shopped: 'shopping_basket', cooked: 'task_alt' };
const STATUSES = (['planned', 'shopped', 'cooked'] as const).map((status) => ({
  id: status,
  label: PLAN_STATUS_LABELS[status],
  icon: STATUS_ICONS[status],
}));

/** Optionen je Wahlkomponente für einen Esser, z. B. „Hähnchen | Halloumi“. */
function ChoiceChips({
  recipe,
  eater,
  onChoose,
}: {
  recipe: RecipeView;
  eater: EaterView;
  onChoose: (groupId: string, optionId: string) => void;
}) {
  return recipe.groups.map((group) => (
    <View key={group.id} style={styles.chips}>
      {group.options.map((option) => (
        <Chip
          key={option.id}
          label={option.name}
          accessibilityLabel={`${eater.name}: ${option.name}`}
          selected={eater.choices[group.id]?.optionId === option.id}
          onPress={() => onChoose(group.id, option.id)}
        />
      ))}
    </View>
  ));
}

export default function PlanEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const tables = useAppTables();
  const meals = useActiveMeals();
  const entry = useMemo(() => buildPlanEntry(tables, id, createDietLookup(tables)), [tables, id]);
  const members = useMemo(() => listMembers(tables), [tables]);
  const today = useToday();

  if (!entry) return <NotFound message="Diesen Eintrag gibt es nicht (mehr)." backLabel="Zum Plan" href="/plan" />;

  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };
  const setServings = (memberId: string, servings: number, now: number) =>
    write(planSetServings(tables, entry.id, memberId, servings, now));
  const update = (cells: Parameters<typeof planUpdateEntry>[2]) => write(planUpdateEntry(tables, entry.id, cells));
  const remove = async () => {
    if (!(await confirm('Aus dem Plan entfernen?', `„${entry.title}“ wird aus dem Plan entfernt.`, 'Entfernen'))) return;
    // Wer einen Eintrag entfernt, hat ihn nicht gekocht: Eine Abbuchung geht zurück in den Vorrat.
    const now = Date.now();
    write([...planRemoveEntry(entry.id, now), ...removeCookedBookings(tables, entry.id, now)]);
    router.back();
  };

  const guests = entry.eaters.find((eater) => !eater.memberId);
  const choose = (eater: EaterView) => (groupId: string, optionId: string) =>
    write(planChoose(tables, eater.id, groupId, optionId));

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: mealLabel(entry.meal) }} />
      {entry.recipe ? <RecipePhoto photoId={entry.recipe.photo} style={styles.photo} alt={`Foto: ${entry.title}`} /> : null}
      <Text style={styles.title}>{entry.title}</Text>
      {entry.recipe && entry.servings > 0 ? (
        <Button icon="skillet" title="Kochen" onPress={() => router.push(`/plan/${entry.id}/cook`)} />
      ) : null}

      <Card>
        <View style={styles.dateRow}>
          <IconButton
            icon="chevron_left"
            variant="secondary"
            size={38}
            accessibilityLabel="Einen Tag früher"
            onPress={() => update({ date: addDays(entry.date, -1) })}
          />
          <Text style={styles.date}>{formatDate(entry.date)}</Text>
          <IconButton
            icon="chevron_right"
            variant="secondary"
            size={38}
            accessibilityLabel="Einen Tag später"
            onPress={() => update({ date: addDays(entry.date, 1) })}
          />
        </View>
        {meals.length > 1 ? (
          <View style={styles.chips}>
            {meals.map((meal) => (
              <Chip
                key={meal.id}
                icon={MEAL_ICONS[meal.id]}
                label={meal.label}
                selected={entry.meal === meal.id}
                onPress={() => update({ meal: meal.id })}
              />
            ))}
          </View>
        ) : null}
        {/* „Gekocht“ bucht die Zutaten aus dem Vorrat ab; zurück nimmt die Abbuchung zurück. */}
        <Segmented
          options={STATUSES}
          value={entry.status}
          onChange={(status) => write(planSetStatus(tables, entry.id, status, Date.now()))}
          small
        />
        {entry.recipe && entry.date < today ? (
          <Hint>Eingekauftes gilt nach seinem Tag als gekocht und geht vom Vorrat ab. Nicht gekocht? Dann „geplant“ wählen.</Hint>
        ) : null}
      </Card>

      {entry.recipe ? (
        <>
          <SectionTitle>Wer isst mit?</SectionTitle>
          {members.length === 0 ? (
            <Notice>Unter Haushalt → Personen eintragen, dann bekommt jede Person automatisch die passende Option.</Notice>
          ) : null}
          {members.map((member) => {
            const eater = entry.eaters.find((candidate) => candidate.memberId === member.id);
            return (
              <Card key={member.id} style={styles.eater}>
                <View style={styles.eaterRow}>
                  <Chip
                    label={member.name || 'Ohne Namen'}
                    accessibilityLabel={`${member.name} isst mit`}
                    selected={!!eater}
                    onPress={() => setServings(member.id, eater ? 0 : 1, Date.now())}
                  />
                  {eater ? (
                    <View style={styles.stepper}>
                      <Stepper
                        label="Portionen"
                        value={eater.servings}
                        canDecrease={eater.servings > 1}
                        onDecrease={() => setServings(member.id, eater.servings - 1, Date.now())}
                        onIncrease={() => setServings(member.id, eater.servings + 1, Date.now())}
                      />
                    </View>
                  ) : null}
                </View>
                {eater ? <ChoiceChips recipe={entry.recipe!} eater={eater} onChoose={choose(eater)} /> : null}
              </Card>
            );
          })}
          <Card style={styles.eater}>
            <Stepper
              icon="group_add"
              label={members.length > 0 ? 'Gäste (Portionen)' : 'Portionen'}
              value={guests?.servings ?? 0}
              canDecrease={(guests?.servings ?? 0) > 0}
              onDecrease={() => setServings('', (guests?.servings ?? 0) - 1, Date.now())}
              onIncrease={() => setServings('', (guests?.servings ?? 0) + 1, Date.now())}
            />
            {guests ? <ChoiceChips recipe={entry.recipe} eater={guests} onChoose={choose(guests)} /> : null}
          </Card>

          {entry.servings > 0 ? (
            <>
              <PlanEntryNutrition entryId={entry.id} />
              <RecipeBody view={entry.recipe} servings={entry.servings} distribution={entry.distribution} />
            </>
          ) : (
            <Hint>Niemand isst mit, deshalb gibt es nichts einzukaufen.</Hint>
          )}
        </>
      ) : (
        <FreeTextEntry entry={entry} onChange={(text) => update({ text })} />
      )}

      <View style={styles.footer}>
        <Button variant="danger" icon="delete" title="Aus dem Plan entfernen" onPress={() => void remove()} />
      </View>
    </ScrollView>
  );
}

function FreeTextEntry({ entry, onChange }: { entry: PlanEntryView; onChange: (text: string) => void }) {
  if (entry.recipeId) return <Notice tone="warning">Das Rezept zu diesem Eintrag wurde gelöscht.</Notice>;
  return <TextField label="Eintrag" value={entry.text} onChangeText={onChange} />;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  photo: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg },
  title: { fontFamily: fonts.display, fontSize: 27, lineHeight: 34, color: colors.text },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  date: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  eater: { padding: spacing.md },
  eaterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepper: { flex: 1 },
  footer: { marginTop: spacing.xl },
});
