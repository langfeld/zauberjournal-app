import { StyleSheet, View } from 'react-native';

import { IconButton } from './ui';

type RowActionsProps = {
  /** Bezeichnung für Screenreader, z. B. „Zutat 2“. */
  label: string;
  index: number;
  count: number;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
};

/** Nach oben, nach unten, entfernen – für Einträge in Bearbeitungslisten. */
export function RowActions({ label, index, count, onMove, onRemove }: RowActionsProps) {
  return (
    <View style={styles.actions}>
      <IconButton
        icon="arrow_upward"
        variant="muted"
        size={36}
        accessibilityLabel={`${label} nach oben`}
        disabled={index === 0}
        onPress={() => onMove(index, -1)}
      />
      <IconButton
        icon="arrow_downward"
        variant="muted"
        size={36}
        accessibilityLabel={`${label} nach unten`}
        disabled={index === count - 1}
        onPress={() => onMove(index, 1)}
      />
      <IconButton icon="close" variant="muted" size={36} accessibilityLabel={`${label} entfernen`} onPress={() => onRemove(index)} />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
});
