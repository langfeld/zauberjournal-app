import {
  createId,
  MEALS,
  planRecipeDelete,
  planRecipeSave,
  validateRecipeDraft,
  type MealId,
  type RecipeDraft,
} from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConnection } from '@/data/connection';
import { applyWrites, useRecipeTables } from '@/data/recipes';
import { useStore } from '@/data/store';
import { confirm } from '@/lib/confirm';
import { spacing } from '@/theme';

import { MEAL_ICONS } from './category-style';
import { ChoiceGroupsEditor } from './choice-groups-editor';
import { HeaderButton, HeaderRight } from './header';
import type { IconName } from './icon';
import { IngredientListEditor } from './ingredient-list-editor';
import { PhotoField } from './photo-field';
import { StepListEditor } from './step-list-editor';
import { Button, Card, Chip, Hint, Notice, SectionTitle, Stepper, TextField } from './ui';
import { useConfirmDiscard } from './use-confirm-discard';

type MinutesFieldProps = { label: string; icon: IconName; value: number | null; onChange: (value: number | null) => void };

function MinutesField({ label, icon, value, onChange }: MinutesFieldProps) {
  return (
    <View style={styles.half}>
      <TextField
        label={label}
        icon={icon}
        keyboardType="number-pad"
        value={value === null ? '' : String(value)}
        placeholder="–"
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '');
          onChange(digits ? Number(digits) : null);
        }}
      />
    </View>
  );
}

/** Was unter „Passt zu“ steht, je nachdem, wer die Mahlzeiten festgelegt hat */
function mealHint(draft: RecipeDraft): string {
  if (!draft.mealsBy) return 'Noch offen; nach dem Speichern schätzt das die KI. Vorgeschlagen wird ein Rezept nur zu passenden Mahlzeiten.';
  if (draft.mealsBy === 'ai') return 'Von der KI geschätzt. Passt etwas nicht, einfach antippen.';
  if (draft.meals.length === 0) return 'Ohne Mahlzeit gilt es als Beilage o. Ä. und wird nicht vorgeschlagen.';
  return 'Vorgeschlagen wird das Rezept nur zu diesen Mahlzeiten.';
}

type RecipeEditorProps = {
  /** `null` für ein neues Rezept. */
  recipeId: string | null;
  initialDraft: RecipeDraft;
  /** Titel in der Kopfzeile; sonst „Neues Rezept“ oder „Rezept bearbeiten“. */
  title?: string;
  /** Hinweise über dem Formular, z. B. unsichere Stellen nach einem Import. */
  notices?: string[];
  /** Der Entwurf gilt schon zu Beginn als ungespeichert (z. B. nach einem Import). */
  dirty?: boolean;
};

export function RecipeEditor({ recipeId, initialDraft, title, notices = [], dirty = false }: RecipeEditorProps) {
  const store = useStore();
  const tables = useRecipeTables();
  const { uploadPhotos } = useConnection();
  const [initial] = useState(initialDraft);
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<string[]>([]);
  const leaving = useRef(false);
  useConfirmDiscard(dirty || draft !== initial, leaving);

  const set = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  // Wer antippt, legt die Mahlzeiten selbst fest; die KI ändert sie danach nicht mehr.
  const toggleMeal = (meal: MealId) =>
    setDraft((current) => {
      const chosen = current.mealsBy ? current.meals : [];
      const next = chosen.includes(meal) ? chosen.filter((id) => id !== meal) : [...chosen, meal];
      return { ...current, meals: MEALS.filter(({ id }) => next.includes(id)).map(({ id }) => id), mealsBy: 'person' };
    });

  const options = draft.groups.flatMap((group) =>
    group.options.map((option, index) => ({ id: option.id, name: option.name.trim() || `Option ${index + 1}` })),
  );

  const save = () => {
    if (!store) return;
    const problems = validateRecipeDraft(draft);
    setErrors(problems);
    if (problems.length > 0) return;
    const { recipeId: savedId, writes } = planRecipeSave(tables, recipeId, draft, Date.now(), createId);
    applyWrites(store, writes);
    if (draft.photo) uploadPhotos();
    leaving.current = true;
    if (recipeId && router.canGoBack()) router.back();
    else router.replace(`/recipes/${savedId}`);
  };

  const remove = async () => {
    if (!store || !recipeId) return;
    const title = draft.title.trim() || 'Dieses Rezept';
    if (!(await confirm('Rezept löschen?', `„${title}“ wird gelöscht.`, 'Löschen'))) return;
    applyWrites(store, planRecipeDelete(recipeId, Date.now()));
    leaving.current = true;
    router.navigate('/');
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: title ?? (recipeId ? 'Rezept bearbeiten' : 'Neues Rezept'),
          headerRight: () => (
            <HeaderRight>
              <HeaderButton primary icon="check" title="Speichern" onPress={save} />
            </HeaderRight>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {notices.length > 0 ? (
          <Notice tone="warning" title="Bitte prüfen">
            {notices}
          </Notice>
        ) : null}
        {errors.length > 0 ? <Notice tone="danger">{errors}</Notice> : null}

        <PhotoField photoId={draft.photo} onChange={(photo) => set('photo', photo)} />
        <Card>
          <TextField
            label="Titel"
            value={draft.title}
            placeholder="z. B. Sättigender Salat"
            onChangeText={(title) => set('title', title)}
          />
          <Stepper
            icon="group"
            label="Portionen"
            value={draft.servings}
            canDecrease={draft.servings > 1}
            onDecrease={() => set('servings', draft.servings - 1)}
            onIncrease={() => set('servings', draft.servings + 1)}
          />
          <View style={styles.row}>
            <MinutesField
              label="Vorbereitung (Min.)"
              icon="timer"
              value={draft.prepMinutes}
              onChange={(value) => set('prepMinutes', value)}
            />
            <MinutesField
              label="Koch-/Backzeit (Min.)"
              icon="skillet"
              value={draft.cookMinutes}
              onChange={(value) => set('cookMinutes', value)}
            />
          </View>
          <TextField
            label="Beschreibung"
            multiline
            value={draft.description}
            onChangeText={(description) => set('description', description)}
          />
        </Card>

        <SectionTitle>Passt zu</SectionTitle>
        <View style={styles.chips}>
          {MEALS.map((meal) => (
            <Chip
              key={meal.id}
              icon={MEAL_ICONS[meal.id]}
              label={meal.label}
              selected={draft.mealsBy !== '' && draft.meals.includes(meal.id)}
              onPress={() => toggleMeal(meal.id)}
            />
          ))}
        </View>
        <Hint>{mealHint(draft)}</Hint>

        <SectionTitle>Zutaten</SectionTitle>
        <Hint>
          Eine Zutat pro Zeile, z. B. „200 g Mehl“ oder „2 Zehen Knoblauch, gehackt“. Alle Mengen gelten für{' '}
          {draft.servings} {draft.servings === 1 ? 'Portion' : 'Portionen'}.
        </Hint>
        <IngredientListEditor items={draft.ingredients} onChange={(ingredients) => set('ingredients', ingredients)} />

        <SectionTitle>Wahlkomponenten</SectionTitle>
        <Hint>Wenn nicht alle dasselbe essen – z. B. Hähnchen oder Halloumi. Jede Person bekommt dann eine Option.</Hint>
        <ChoiceGroupsEditor groups={draft.groups} onChange={(groups) => set('groups', groups)} />

        <SectionTitle>Zubereitung</SectionTitle>
        <StepListEditor steps={draft.steps} options={options} onChange={(steps) => set('steps', steps)} />

        <SectionTitle>Sonstiges</SectionTitle>
        <TextField label="Notizen" multiline value={draft.notes} onChangeText={(notes) => set('notes', notes)} />
        <TextField
          label="Quelle"
          icon="link"
          value={draft.source}
          placeholder="z. B. Kochbuch S. 42 oder ein Link"
          autoCapitalize="none"
          onChangeText={(source) => set('source', source)}
        />

        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <Button icon="check" title="Speichern" onPress={save} />
          {recipeId ? <Button variant="danger" icon="delete" title="Rezept löschen" onPress={remove} /> : null}
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  half: { flex: 1 },
  footer: { gap: spacing.md, marginTop: spacing.xl },
});
