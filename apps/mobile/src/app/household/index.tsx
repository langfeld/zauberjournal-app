import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { HouseholdSettings } from '@/components/household-settings';
import { Icon } from '@/components/icon';
import { ReweSettings } from '@/components/rewe-settings';
import { SyncStatusLine } from '@/components/sync-status';
import { Button, Card, CardHeader, Hint, IconButton, IconCircle, Notice, SectionTitle, Tag } from '@/components/ui';
import { listDevices, removeDevice, type DeviceInfo } from '@/data/api';
import { useConnection } from '@/data/connection';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/error-message';
import { colors, spacing, tones } from '@/theme';

function lastSeen(device: DeviceInfo): string {
  if (!device.lastSeenAt) return 'Noch nicht aktiv';
  const date = new Date(device.lastSeenAt);
  return `Zuletzt aktiv: ${date.toLocaleDateString('de-DE')}, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

function NotConnected() {
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Haushalt' }} />
      <Card>
        <SyncStatusLine status="off" />
      </Card>
      <Card>
        <CardHeader icon="add_home" title="Neuen Haushalt einrichten" />
        <Text style={styles.body}>
          Für das erste Gerät. Du brauchst die Adresse deines Servers und den Einrichtungscode aus dem Protokoll des
          Servers.
        </Text>
        <Button icon="add_home" title="Einrichten" onPress={() => router.push('/household/setup')} />
      </Card>
      <Card>
        <CardHeader icon="group_add" title="Einem Haushalt beitreten" tone={tones.teal} />
        <Text style={styles.body}>
          Auf einem Gerät, das schon verbunden ist, unter „Haushalt → Gerät hinzufügen“ einen QR-Code anzeigen lassen.
        </Text>
        <Button variant="secondary" icon="qr_code_scanner" title="Beitreten" onPress={() => router.push('/household/join')} />
      </Card>
      <Hint>Rezepte, die schon auf diesem Gerät liegen, werden beim Verbinden mit dem Haushalt zusammengeführt.</Hint>
      <HouseholdSettings />
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
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Haushalt' }} />
      <Card>
        <SyncStatusLine status={status} />
        <View style={styles.server}>
          <Icon name="dns" size={18} color={colors.textMuted} />
          <Text style={styles.meta} numberOfLines={1}>
            {credentials.serverUrl}
          </Text>
        </View>
      </Card>

      {status === 'revoked' ? (
        <Button icon="sync" title="Neu verbinden" onPress={() => void disconnect()} />
      ) : (
        <Button icon="qr_code" title="Gerät hinzufügen" onPress={() => router.push('/household/invite')} />
      )}

      <HouseholdSettings />
      <ReweSettings />

      <SectionTitle>Geräte</SectionTitle>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {devices && devices.length > 0 ? (
        <Card style={styles.devices}>
          {devices.map((device, index) => (
            <View key={device.id} style={[styles.device, index > 0 && styles.divider]}>
              <IconCircle icon="smartphone" tone={device.current ? tones.green : tones.stone} size={40} />
              <View style={styles.deviceText}>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.meta}>{lastSeen(device)}</Text>
                {device.current ? <Tag label="dieses Gerät" tone={tones.green} /> : null}
              </View>
              {device.current ? null : (
                <IconButton
                  icon="delete"
                  variant="muted"
                  accessibilityLabel={`${device.name} entfernen`}
                  onPress={() => void remove(device)}
                />
              )}
            </View>
          ))}
        </Card>
      ) : null}

      <View style={styles.footer}>
        <Button variant="danger" icon="logout" title="Dieses Gerät abmelden" onPress={() => void leave()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  server: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { flexShrink: 1, fontSize: 14, color: colors.textMuted },
  devices: { paddingVertical: spacing.xs, gap: 0 },
  device: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  deviceText: { flex: 1, gap: 3 },
  deviceName: { fontSize: 16, fontWeight: '600', color: colors.text },
  footer: { marginTop: spacing.xl },
});
