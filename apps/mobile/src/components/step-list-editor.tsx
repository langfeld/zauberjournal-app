import { createId, type StepDraft } from '@zauberjournal/core';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { moveItem } from '@/lib/move-item';
import { colors, fonts, spacing } from '@/theme';

import { RowActions } from './row-actions';
import { Button, Chip, TextField } from './ui';

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
              <View style={styles.number}>
                <Text style={styles.numberText}>{index + 1}</Text>
              </View>
              <Text style={styles.title}>Schritt {index + 1}</Text>
              <RowActions
                label={`Schritt ${index + 1}`}
                index={index}
                count={steps.length}
                onMove={(i, delta) => onChange(moveItem(steps, i, delta))}
                onRemove={(i) => onChange(steps.filter((_, other) => other !== i))}
              />
            </View>
            <TextField
              accessibilityLabel={`Schritt ${index + 1}`}
              multiline
              value={step.text}
              onChangeText={(text) => update(index, { text })}
              autoFocus={step.id === focusId}
              placeholder="Was ist zu tun?"
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
        <Button small variant="secondary" icon="add" title="Schritt" accessibilityLabel="Schritt hinzufügen" onPress={add} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.lg },
  step: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  numberText: { fontFamily: fonts.display, fontSize: 15, lineHeight: 20, color: colors.accent },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  addRow: { flexDirection: 'row' },
});
