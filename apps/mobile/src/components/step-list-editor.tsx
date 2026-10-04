import { createId, type StepDraft } from '@zauberjournal/core';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { moveItem } from '@/lib/move-item';
import { colors, radius, spacing } from '@/theme';

import { RowActions } from './row-actions';
import { Button, Chip } from './ui';

type StepListEditorProps = {
  steps: StepDraft[];
  /** Alle Optionen aller Wahlkomponenten, um Schritte einer Option zuzuordnen. */
  options: { id: string; name: string }[];
  onChange: (steps: StepDraft[]) => void;
};

export function StepListEditor({ steps, options, onChange }: StepListEditorProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const update = (index: number, change: Partial<StepDraft>) =>
    onChange(steps.map((step, i) => (i === index ? { ...step, ...change } : step)));

  const add = () => {
    const step: StepDraft = { id: createId(), text: '', optionId: '' };
    setFocusId(step.id);
    onChange([...steps, step]);
  };

  return (
    <View style={styles.list}>
      {steps.map((step, index) => {
        const selectedOption = options.some((option) => option.id === step.optionId) ? step.optionId : '';
        return (
          <View key={step.id} style={styles.step}>
            <View style={styles.header}>
              <Text style={styles.number}>Schritt {index + 1}</Text>
              <RowActions
                label={`Schritt ${index + 1}`}
                index={index}
                count={steps.length}
                onMove={(i, delta) => onChange(moveItem(steps, i, delta))}
                onRemove={(i) => onChange(steps.filter((_, other) => other !== i))}
              />
            </View>
            <TextInput
              accessibilityLabel={`Schritt ${index + 1}`}
              multiline
              value={step.text}
              onChangeText={(text) => update(index, { text })}
              autoFocus={step.id === focusId}
              placeholder="Was ist zu tun?"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            {options.length > 0 ? (
              <View style={styles.chips}>
                <Chip
                  label="Für alle"
                  accessibilityLabel={`Schritt ${index + 1}: für alle`}
                  selected={selectedOption === ''}
                  onPress={() => update(index, { optionId: '' })}
                />
                {options.map((option) => (
                  <Chip
                    key={option.id}
                    label={`Nur ${option.name}`}
                    accessibilityLabel={`Schritt ${index + 1}: nur ${option.name}`}
                    selected={selectedOption === option.id}
                    onPress={() => update(index, { optionId: option.id })}
                  />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={styles.addRow}>
        <Button small variant="secondary" title="+ Schritt" onPress={add} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  step: { gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  number: { fontSize: 15, fontWeight: '700', color: colors.text },
  input: {
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  addRow: { flexDirection: 'row' },
});
