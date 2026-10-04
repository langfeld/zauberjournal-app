import {
  createId,
  planRecipeDelete,
  planRecipeSave,
  validateRecipeDraft,
  type RecipeDraft,
} from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { applyWrites, useRecipeTables } from '@/data/recipes';
import { useStore } from '@/data/store';
import { confirm } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

import { ChoiceGroupsEditor } from './choice-groups-editor';
import { IngredientListEditor } from './ingredient-list-editor';
import { StepListEditor } from './step-list-editor';
import { Button, Hint, SectionTitle, Stepper, TextField } from './ui';
import { useConfirmDiscard } from './use-confirm-discard';

function MinutesField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <View style={styles.half}>
      <TextField
        label={label}
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

type RecipeEditorProps = {
  /** `null` für ein neues Rezept. */
  recipeId: string | null;
  initialDraft: RecipeDraft;
};

export function RecipeEditor({ recipeId, initialDraft }: RecipeEditorProps) {
  const store = useStore();
  const tables = useRecipeTables();
  const [initial] = useState(initialDraft);
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<string[]>([]);
  const leaving = useRef(false);
  useConfirmDiscard(draft !== initial, leaving);

  const set = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

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
          title: recipeId ? 'Rezept bearbeiten' : 'Neues Rezept',
          headerRight: () => <Button small variant="ghost" title="Speichern" onPress={save} />,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {errors.length > 0 ? (
          <View style={styles.errors} accessibilityRole="alert">
            {errors.map((error) => (
              <Text key={error} style={styles.errorText}>
                {error}
              </Text>
            ))}
          </View>
        ) : null}

        <TextField
          label="Titel"
          value={draft.title}
          placeholder="z. B. Sättigender Salat"
          onChangeText={(title) => set('title', title)}
        />
        <Stepper
          label="Portionen"
          value={draft.servings}
          canDecrease={draft.servings > 1}
          onDecrease={() => set('servings', draft.servings - 1)}
          onIncrease={() => set('servings', draft.servings + 1)}
        />
        <View style={styles.row}>
          <MinutesField label="Vorbereitung (Min.)" value={draft.prepMinutes} onChange={(value) => set('prepMinutes', value)} />
          <MinutesField label="Koch-/Backzeit (Min.)" value={draft.cookMinutes} onChange={(value) => set('cookMinutes', value)} />
        </View>
        <TextField
          label="Beschreibung"
          multiline
          value={draft.description}
          onChangeText={(description) => set('description', description)}
        />

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
          value={draft.source}
          placeholder="z. B. Kochbuch S. 42 oder ein Link"
          autoCapitalize="none"
          onChangeText={(source) => set('source', source)}
        />

        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <Button title="Speichern" onPress={save} />
          {recipeId ? <Button variant="danger" title="Rezept löschen" onPress={remove} /> : null}
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  errors: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { color: colors.danger, fontSize: 15 },
  footer: { gap: spacing.md, marginTop: spacing.lg },
});
