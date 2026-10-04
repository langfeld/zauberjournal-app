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
  planUpdateEntry,
  type EaterView,
  type PlanEntryView,
  type PlanStatus,
  type RecipeView,
  type RowWrite,
} from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { NotFound } from '@/components/not-found';
import { RecipeBody } from '@/components/recipe-body';
import { RecipePhoto } from '@/components/recipe-photo';
import { Button, Card, Chip, Hint, SectionTitle, Stepper, TextField } from '@/components/ui';
import { applyWrites } from '@/data/recipes';
import { useStore } from '@/data/store';
import { useActiveMeals, useAppTables } from '@/data/tables';
import { confirm } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

const STATUSES: PlanStatus[] = ['planned', 'shopped', 'cooked'];

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

  if (!entry) return <NotFound message="Diesen Eintrag gibt es nicht (mehr)." backLabel="Zum Plan" href="/plan" />;

  const write = (writes: RowWrite[]) => {
    if (store && writes.length > 0) applyWrites(store, writes);
  };
  const setServings = (memberId: string, servings: number, now: number) =>
    write(planSetServings(tables, entry.id, memberId, servings, now));
  const update = (cells: Parameters<typeof planUpdateEntry>[2]) => write(planUpdateEntry(tables, entry.id, cells));
  const remove = async () => {
    if (!(await confirm('Aus dem Plan entfernen?', `„${entry.title}“ wird aus dem Plan entfernt.`, 'Entfernen'))) return;
    write(planRemoveEntry(entry.id, Date.now()));
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

      <Card>
        <View style={styles.dateRow}>
          <Button small variant="secondary" title="‹" accessibilityLabel="Einen Tag früher" onPress={() => update({ date: addDays(entry.date, -1) })} />
          <Text style={styles.date}>{formatDate(entry.date)}</Text>
          <Button small variant="secondary" title="›" accessibilityLabel="Einen Tag später" onPress={() => update({ date: addDays(entry.date, 1) })} />
        </View>
        {meals.length > 1 ? (
          <View style={styles.chips}>
            {meals.map((meal) => (
              <Chip key={meal.id} label={meal.label} selected={entry.meal === meal.id} onPress={() => update({ meal: meal.id })} />
            ))}
          </View>
        ) : null}
        <View style={styles.chips}>
          {STATUSES.map((status) => (
            <Chip
              key={status}
              label={PLAN_STATUS_LABELS[status]}
              selected={entry.status === status}
              onPress={() => update({ status })}
            />
          ))}
        </View>
      </Card>

      {entry.recipe ? (
        <>
          <SectionTitle>Wer isst mit?</SectionTitle>
          {members.length === 0 ? (
            <Hint>Unter Haushalt → Personen eintragen, dann bekommt jede Person automatisch die passende Option.</Hint>
          ) : null}
          {members.map((member) => {
            const eater = entry.eaters.find((candidate) => candidate.memberId === member.id);
            return (
              <View key={member.id} style={styles.eater}>
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
              </View>
            );
          })}
          <View style={styles.eater}>
            <Stepper
              label={members.length > 0 ? 'Gäste (Portionen)' : 'Portionen'}
              value={guests?.servings ?? 0}
              canDecrease={(guests?.servings ?? 0) > 0}
              onDecrease={() => setServings('', (guests?.servings ?? 0) - 1, Date.now())}
              onIncrease={() => setServings('', (guests?.servings ?? 0) + 1, Date.now())}
            />
            {guests ? <ChoiceChips recipe={entry.recipe} eater={guests} onChoose={choose(guests)} /> : null}
          </View>

          {entry.servings > 0 ? (
            <RecipeBody view={entry.recipe} servings={entry.servings} distribution={entry.distribution} />
          ) : (
            <Hint>Niemand isst mit, deshalb gibt es nichts einzukaufen.</Hint>
          )}
        </>
      ) : (
        <FreeTextEntry entry={entry} onChange={(text) => update({ text })} />
      )}

      <View style={styles.footer}>
        <Button variant="danger" title="Aus dem Plan entfernen" onPress={() => void remove()} />
      </View>
    </ScrollView>
  );
}

function FreeTextEntry({ entry, onChange }: { entry: PlanEntryView; onChange: (text: string) => void }) {
  if (entry.recipeId) return <Hint>Das Rezept zu diesem Eintrag wurde gelöscht.</Hint>;
  return <TextField label="Eintrag" value={entry.text} onChangeText={onChange} />;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  photo: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  date: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  eater: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  eaterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepper: { flex: 1 },
  footer: { marginTop: spacing.xl },
});
