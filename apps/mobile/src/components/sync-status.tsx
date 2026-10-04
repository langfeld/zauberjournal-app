import { StyleSheet, Text, View } from 'react-native';

import type { SyncStatus } from '@/data/sync';
import { colors, spacing } from '@/theme';

const STATUS: Record<SyncStatus, { color: string; label: string; description: string }> = {
  off: {
    color: colors.textMuted,
    label: 'Nicht verbunden',
    description: 'Die Rezepte liegen nur auf diesem Gerät.',
  },
  connecting: { color: colors.warning, label: 'Verbinde …', description: 'Die Verbindung zum Server wird aufgebaut.' },
  online: { color: colors.primary, label: 'Synchronisiert', description: 'Änderungen landen sofort auf allen Geräten.' },
  offline: {
    color: colors.warning,
    label: 'Offline',
    description: 'Der Server ist gerade nicht erreichbar. Änderungen werden übertragen, sobald er wieder da ist.',
  },
  revoked: {
    color: colors.danger,
    label: 'Abgemeldet',
    description: 'Dieses Gerät wurde aus dem Haushalt entfernt. Die Rezepte bleiben auf dem Gerät.',
  },
};

export function syncStatusText(status: SyncStatus) {
  return STATUS[status];
}

export function StatusDot({ status }: { status: SyncStatus }) {
  return <View style={[styles.dot, { backgroundColor: STATUS[status].color }]} />;
}

export function SyncStatusLine({ status }: { status: SyncStatus }) {
  const { label, description } = STATUS[status];
  return (
    <View style={styles.line}>
      <View style={styles.row}>
        <StatusDot status={status} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontSize: 17, fontWeight: '600', color: colors.text },
  description: { fontSize: 14, color: colors.textMuted },
});
