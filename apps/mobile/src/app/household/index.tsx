import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SyncStatusLine } from '@/components/sync-status';
import { Button, Card, Hint, SectionTitle } from '@/components/ui';
import { listDevices, removeDevice, type DeviceInfo } from '@/data/api';
import { useConnection } from '@/data/connection';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/error-message';
import { colors, radius, spacing } from '@/theme';

function lastSeen(device: DeviceInfo): string {
  if (!device.lastSeenAt) return 'Noch nicht aktiv';
  const date = new Date(device.lastSeenAt);
  return `Zuletzt aktiv: ${date.toLocaleDateString('de-DE')}, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

function NotConnected() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Haushalt' }} />
      <SyncStatusLine status="off" />
      <Card>
        <Text style={styles.cardTitle}>Neuen Haushalt einrichten</Text>
        <Text style={styles.body}>
          Für das erste Gerät. Du brauchst die Adresse deines Servers und den Einrichtungscode aus dem Protokoll des
          Servers.
        </Text>
        <Button title="Einrichten" onPress={() => router.push('/household/setup')} />
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Einem Haushalt beitreten</Text>
        <Text style={styles.body}>
          Auf einem Gerät, das schon verbunden ist, unter „Haushalt → Gerät hinzufügen“ einen QR-Code anzeigen lassen.
        </Text>
        <Button variant="secondary" title="Beitreten" onPress={() => router.push('/household/join')} />
      </Card>
      <Hint>Rezepte, die schon auf diesem Gerät liegen, werden beim Verbinden mit dem Haushalt zusammengeführt.</Hint>
    </ScrollView>
  );
}

export default function HouseholdScreen() {
  const { credentials, status, disconnect } = useConnection();
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!credentials) return;
    try {
      setDevices(await listDevices(credentials));
      setError(null);
    } catch (problem) {
      setError(errorMessage(problem));
    }
  }, [credentials]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (!credentials) return <NotConnected />;

  const remove = async (device: DeviceInfo) => {
    const message = `„${device.name}“ wird vom Haushalt getrennt. Die Rezepte auf dem Gerät bleiben dort, werden aber nicht mehr abgeglichen.`;
    if (!(await confirm('Gerät entfernen?', message, 'Entfernen'))) return;
    try {
      await removeDevice(credentials, device.id);
      await refresh();
    } catch (problem) {
      setError(errorMessage(problem));
    }
  };

  const leave = async () => {
    const message = 'Die Rezepte bleiben auf diesem Gerät, werden aber nicht mehr mit dem Haushalt abgeglichen.';
    if (!(await confirm('Dieses Gerät abmelden?', message, 'Abmelden'))) return;
    try {
      await removeDevice(credentials, credentials.deviceId);
    } catch {
      // Offline oder schon entfernt: lokal trotzdem abmelden.
    }
    await disconnect();
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Haushalt' }} />
      <Card>
        <SyncStatusLine status={status} />
        <Text style={styles.meta}>Server: {credentials.serverUrl}</Text>
      </Card>

      {status === 'revoked' ? (
        <Button title="Neu verbinden" onPress={() => void disconnect()} />
      ) : (
        <Button title="Gerät hinzufügen" onPress={() => router.push('/household/invite')} />
      )}

      <SectionTitle>Geräte</SectionTitle>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {devices?.map((device) => (
        <View key={device.id} style={styles.device}>
          <View style={styles.deviceText}>
            <Text style={styles.deviceName}>
              {device.name}
              {device.current ? <Text style={styles.meta}> · dieses Gerät</Text> : null}
            </Text>
            <Text style={styles.meta}>{lastSeen(device)}</Text>
          </View>
          {device.current ? null : (
            <Button
              small
              variant="danger"
              title="Entfernen"
              accessibilityLabel={`${device.name} entfernen`}
              onPress={() => void remove(device)}
            />
          )}
        </View>
      ))}

      <View style={styles.footer}>
        <Button variant="danger" title="Dieses Gerät abmelden" onPress={() => void leave()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, lineHeight: 21, color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted, fontWeight: '400' },
  error: { fontSize: 15, color: colors.danger },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  deviceText: { flex: 1, gap: 2 },
  deviceName: { fontSize: 16, fontWeight: '600', color: colors.text },
  footer: { marginTop: spacing.xl },
});
