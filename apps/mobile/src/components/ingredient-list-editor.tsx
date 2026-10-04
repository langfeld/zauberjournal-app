import { createId, displayIngredient, parseIngredientLine, type IngredientDraft, type IngredientKind } from '@zauberjournal/core';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { moveItem } from '@/lib/move-item';
import { colors, radius, spacing } from '@/theme';

import { RowActions } from './row-actions';
import { Button } from './ui';

/** Zeigt, wie eine Zeile verstanden wird, z. B. „200 g · Mehl · fein gehackt“. */
function IngredientPreview({ text }: { text: string }) {
  const parsed = parseIngredientLine(text);
  if (!parsed || (parsed.amount === null && !parsed.unit)) return null;
  const display = displayIngredient({ id: '', kind: 'ingredient', ...parsed }, 1);
  const parts = [[display.amount, display.unit].filter(Boolean).join(' '), display.name, display.note].filter(Boolean);
  return <Text style={styles.preview}>{parts.join(' · ')}</Text>;
}

type IngredientListEditorProps = {
  items: IngredientDraft[];
  onChange: (items: IngredientDraft[]) => void;
  allowHeadings?: boolean;
  /** Vorangestellt in den Bezeichnungen für Screenreader, z. B. der Name einer Option. */
  labelPrefix?: string;
};

export function IngredientListEditor({ items, onChange, allowHeadings = true, labelPrefix = '' }: IngredientListEditorProps) {
  const [focusId, setFocusId] = useState<string | null>(null);

  const insert = (index: number, kind: IngredientKind) => {
    const item: IngredientDraft = { id: createId(), kind, text: '' };
    setFocusId(item.id);
    onChange([...items.slice(0, index), item, ...items.slice(index)]);
  };
  const update = (index: number, text: string) =>
    onChange(items.map((item, i) => (i === index ? { ...item, text } : item)));

  return (
    <View style={styles.list}>
      {items.map((item, index) => {
        const label = `${labelPrefix}${item.kind === 'heading' ? 'Überschrift' : 'Zutat'} ${index + 1}`;
        return (
          <View key={item.id} style={styles.row}>
            <View style={styles.inputColumn}>
              <TextInput
                accessibilityLabel={label}
                value={item.text}
                onChangeText={(text) => update(index, text)}
                autoFocus={item.id === focusId}
                placeholder={item.kind === 'heading' ? 'Zwischenüberschrift, z. B. Für das Dressing' : 'z. B. 200 g Mehl'}
                placeholderTextColor={colors.textMuted}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => insert(index + 1, 'ingredient')}
                style={[styles.input, item.kind === 'heading' && styles.headingInput]}
              />
              {item.kind === 'ingredient' ? <IngredientPreview text={item.text} /> : null}
            </View>
            <RowActions
              label={label}
              index={index}
              count={items.length}
              onMove={(i, delta) => onChange(moveItem(items, i, delta))}
              onRemove={(i) => onChange(items.filter((_, other) => other !== i))}
            />
          </View>
        );
      })}
      <View style={styles.addRow}>
        <Button
          small
          variant="secondary"
          title="+ Zutat"
          accessibilityLabel={`${labelPrefix}Zutat hinzufügen`}
          onPress={() => insert(items.length, 'ingredient')}
        />
        {allowHeadings ? (
          <Button
            small
            variant="ghost"
            title="+ Überschrift"
            accessibilityLabel={`${labelPrefix}Überschrift hinzufügen`}
            onPress={() => insert(items.length, 'heading')}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  inputColumn: { flex: 1, gap: 2 },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  headingInput: { fontWeight: '700' },
  preview: { fontSize: 13, color: colors.textMuted, paddingHorizontal: spacing.sm },
  addRow: { flexDirection: 'row', gap: spacing.sm },
});
