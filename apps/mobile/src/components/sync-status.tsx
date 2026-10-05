import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useConnection } from '@/data/connection';
import type { SyncStatus } from '@/data/sync';
import { colors, fonts, radius, spacing, tones, type Tone } from '@/theme';

import { Icon, type IconName } from './icon';
import { IconCircle } from './ui';

type StatusInfo = { tone: Tone; icon: IconName; short: string; label: string; description: string };

const STATUS: Record<SyncStatus, StatusInfo> = {
  off: {
    tone: tones.stone,
    icon: 'smartphone',
    short: 'Nur lokal',
    label: 'Nicht verbunden',
    description: 'Die Rezepte liegen nur auf diesem Gerät.',
  },
  connecting: {
    tone: { background: colors.warningSoft, foreground: colors.warning },
    icon: 'cloud_sync',
    short: 'Verbinde …',
    label: 'Verbinde …',
    description: 'Die Verbindung zum Server wird aufgebaut.',
  },
  online: {
    tone: { background: colors.primarySoft, foreground: colors.primary },
    icon: 'cloud_done',
    short: 'Synchron',
    label: 'Synchronisiert',
    description: 'Änderungen landen sofort auf allen Geräten.',
  },
  offline: {
    tone: { background: colors.warningSoft, foreground: colors.warning },
    icon: 'cloud_off',
    short: 'Offline',
    label: 'Offline',
    description: 'Der Server ist gerade nicht erreichbar. Änderungen werden übertragen, sobald er wieder da ist.',
  },
  revoked: {
    tone: { background: colors.dangerSoft, foreground: colors.danger },
    icon: 'person_off',
    short: 'Abgemeldet',
    label: 'Abgemeldet',
    description: 'Dieses Gerät wurde aus dem Haushalt entfernt. Die Rezepte bleiben auf dem Gerät.',
  },
};

/** Sync-Status für die Kopfzeile; antippen führt zum Haushalt. */
export function SyncBadge() {
  const { status } = useConnection();
  const { tone, icon, short, label } = STATUS[status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Zum Haushalt`}
      hitSlop={6}
      onPress={() => router.navigate('/household')}
      style={({ pressed }) => [styles.badge, { backgroundColor: tone.background }, pressed && styles.pressed]}>
      <Icon name={icon} size={17} color={tone.foreground} />
      <Text style={[styles.badgeText, { color: tone.foreground }]}>{short}</Text>
    </Pressable>
  );
}

/** Status mit Erklärung, z. B. oben auf der Haushaltsseite. */
export function SyncStatusLine({ status }: { status: SyncStatus }) {
  const { tone, icon, label, description } = STATUS[status];
  return (
    <View style={styles.line}>
      <IconCircle icon={icon} tone={tone} size={48} />
      <View style={styles.lineText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.md,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lineText: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.display, fontSize: 19, lineHeight: 25, color: colors.text },
  description: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
