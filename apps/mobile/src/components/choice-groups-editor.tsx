import { createId, type ChoiceGroupDraft, type ChoiceOptionDraft } from '@zauberjournal/core';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { IngredientListEditor } from './ingredient-list-editor';
import { Button, Card, TextField } from './ui';

const OPTION_EXAMPLES = ['Hähnchen', 'Halloumi', 'Tofu'];

function newOption(): ChoiceOptionDraft {
  return { id: createId(), name: '', ingredients: [] };
}

type ChoiceGroupsEditorProps = {
  groups: ChoiceGroupDraft[];
  onChange: (groups: ChoiceGroupDraft[]) => void;
};

export function ChoiceGroupsEditor({ groups, onChange }: ChoiceGroupsEditorProps) {
  const updateGroup = (groupId: string, change: (group: ChoiceGroupDraft) => ChoiceGroupDraft) =>
    onChange(groups.map((group) => (group.id === groupId ? change(group) : group)));
  const updateOption = (groupId: string, optionId: string, change: Partial<ChoiceOptionDraft>) =>
    updateGroup(groupId, (group) => ({
      ...group,
      options: group.options.map((option) => (option.id === optionId ? { ...option, ...change } : option)),
    }));

  return (
    <View style={styles.list}>
      {groups.map((group) => (
        <Card key={group.id}>
          <TextField
            label="Wahlkomponente"
            value={group.name}
            placeholder="z. B. Protein"
            onChangeText={(name) => updateGroup(group.id, (current) => ({ ...current, name }))}
          />
          {group.options.map((option, index) => (
            <View key={option.id} style={styles.option}>
              <View style={styles.optionHeader}>
                <TextInput
                  accessibilityLabel={`Option ${index + 1}`}
                  value={option.name}
                  onChangeText={(name) => updateOption(group.id, option.id, { name })}
                  placeholder={`Option ${index + 1}, z. B. ${OPTION_EXAMPLES[index % OPTION_EXAMPLES.length]}`}
                  placeholderTextColor={colors.textMuted}
                  style={styles.optionName}
                />
                <Button
                  small
                  variant="ghost"
                  title="✕"
                  accessibilityLabel={`Option ${option.name || index + 1} entfernen`}
                  onPress={() =>
                    updateGroup(group.id, (current) => ({
                      ...current,
                      options: current.options.filter((other) => other.id !== option.id),
                    }))
                  }
                />
              </View>
              <IngredientListEditor
                items={option.ingredients}
                allowHeadings={false}
                labelPrefix={`${option.name.trim() || `Option ${index + 1}`}: `}
                onChange={(ingredients) => updateOption(group.id, option.id, { ingredients })}
              />
            </View>
          ))}
          <View style={styles.actions}>
            <Button
              small
              variant="secondary"
              title="+ Option"
              onPress={() => updateGroup(group.id, (current) => ({ ...current, options: [...current.options, newOption()] }))}
            />
            <Button
              small
              variant="danger"
              title="Wahlkomponente entfernen"
              onPress={() => onChange(groups.filter((other) => other.id !== group.id))}
            />
          </View>
        </Card>
      ))}
      <View style={styles.actions}>
        <Button
          small
          variant="secondary"
          title="+ Wahlkomponente"
          onPress={() => onChange([...groups, { id: createId(), name: '', options: [newOption(), newOption()] }])}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  option: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  optionName: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
