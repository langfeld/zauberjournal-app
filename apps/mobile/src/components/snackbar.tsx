import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme';

/** So lange bleibt eine Meldung stehen. */
const VISIBLE_MS = 6000;

export type SnackbarMessage = { text: string; action?: { label: string; onPress: () => void } };

type SnackbarProps = {
  message: SnackbarMessage | null;
  /** Muss gleich bleiben (`useCallback`), sonst beginnt die Zeit bei jedem Rendern neu. */
  onHide: () => void;
  /** Abstand zum unteren Rand, z. B. über Knöpfen am Fuß der Seite */
  bottom?: number;
};

/** Kurze Meldung am unteren Rand, etwa „… eingeplant“ mit „Rückgängig“; verschwindet nach ein paar Sekunden. */
export function Snackbar({ message, onHide, bottom = spacing.lg }: SnackbarProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onHide, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, onHide]);

  if (!message) return null;
  const { action } = message;
  return (
    <View style={[styles.bar, { bottom }]} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{message.text}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            action.onPress();
            onHide();
          }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.text,
    boxShadow: shadows.raised,
  },
  text: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.surface },
  action: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.primarySoft },
  pressed: { opacity: 0.7 },
});
