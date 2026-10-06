import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing, tones } from '@/theme';

import { Icon, type IconName } from './icon';

/** Rechte Seite der Kopfzeile. Android rückt sie selbst vom Rand ab, im Browser fehlt der Abstand. */
export function HeaderRight({ children }: { children: ReactNode }) {
  return <View style={styles.right}>{children}</View>;
}

/** Titel der Kopfzeile in der Schrift der App. */
export function HeaderTitle({ children }: { children: string }) {
  return (
    <Text numberOfLines={1} accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}

type HeaderButtonProps = {
  title: string;
  icon?: IconName;
  onPress: () => void;
  /** Gefüllt, für die Hauptaktion wie „Speichern“. */
  primary?: boolean;
};

/** Knopf rechts in der Kopfzeile, z. B. „Bearbeiten“. */
export function HeaderButton({ title, icon, onPress, primary }: HeaderButtonProps) {
  const color = primary ? colors.primaryText : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.button, primary && styles.buttonPrimary, pressed && styles.pressed]}>
      {icon ? <Icon name={icon} size={18} color={color} /> : null}
      <Text style={[styles.buttonText, { color }]}>{title}</Text>
    </Pressable>
  );
}

type HeaderFavoriteProps = { favorite: boolean; onPress: () => void };

/** Herz in der Kopfzeile: ein Rezept als Lieblingsessen merken oder wieder herausnehmen. */
export function HeaderFavorite({ favorite, onPress }: HeaderFavoriteProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={favorite ? 'Lieblingsessen, antippen zum Entfernen' : 'Als Lieblingsessen merken'}
      accessibilityState={{ selected: favorite }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, favorite && styles.favorite, pressed && styles.pressed]}>
      <Icon name="favorite" size={20} color={favorite ? tones.rose.foreground : colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginRight: Platform.OS === 'web' ? spacing.lg : 0 },
  title: { fontFamily: fonts.display, fontSize: 21, lineHeight: 28, color: colors.text },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  favorite: { backgroundColor: tones.rose.background },
  buttonText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
