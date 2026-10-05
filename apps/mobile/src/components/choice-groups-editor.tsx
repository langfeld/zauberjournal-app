import { createId, type ChoiceGroupDraft, type ChoiceOptionDraft } from '@zauberjournal/core';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { IngredientListEditor } from './ingredient-list-editor';
import { Button, Card, IconButton, TextField } from './ui';

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
            icon="alt_route"
            value={group.name}
            placeholder="z. B. Protein"
            onChangeText={(name) => updateGroup(group.id, (current) => ({ ...current, name }))}
          />
          {group.options.map((option, index) => (
            <View key={option.id} style={styles.option}>
              <View style={styles.optionHeader}>
                <TextField
                  accessibilityLabel={`Option ${index + 1}`}
                  value={option.name}
                  onChangeText={(name) => updateOption(group.id, option.id, { name })}
                  placeholder={`Option ${index + 1}, z. B. ${OPTION_EXAMPLES[index % OPTION_EXAMPLES.length]}`}
                  containerStyle={styles.grow}
                  style={styles.optionName}
                />
                <IconButton
                  icon="close"
                  variant="muted"
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
              icon="add"
              title="Option"
              accessibilityLabel="Option hinzufügen"
              onPress={() => updateGroup(group.id, (current) => ({ ...current, options: [...current.options, newOption()] }))}
            />
            <Button
              small
              variant="danger"
              icon="delete"
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
          icon="add"
          title="Wahlkomponente"
          accessibilityLabel="Wahlkomponente hinzufügen"
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
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
  },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  grow: { flex: 1 },
  optionName: { fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
