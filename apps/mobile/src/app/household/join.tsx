import { normalizeServerUrl, parsePairingLink } from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { QrScanner } from '@/components/qr-scanner';
import { Button, EmptyState, Hint, Notice, TextField } from '@/components/ui';
import { joinHousehold } from '@/data/api';
import { useConnection } from '@/data/connection';
import { suggestedDeviceName } from '@/lib/device-name';
import { errorMessage } from '@/lib/error-message';
import { spacing, tones } from '@/theme';

export default function JoinScreen() {
  // Kommt auch über den Link aus dem QR-Code: zauberjournal://household/join?server=…&code=…
  const params = useLocalSearchParams<{ server?: string; code?: string }>();
  const { credentials, connect } = useConnection();
  const [serverUrl, setServerUrl] = useState(params.server ?? '');
  const [code, setCode] = useState(params.code ?? '');
  const [deviceName, setDeviceName] = useState(suggestedDeviceName);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (credentials) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Haushalt beitreten' }} />
        <EmptyState icon="home" title="Schon verbunden" tone={tones.teal}>
          Dieses Gerät ist schon mit einem Haushalt verbunden.
        </EmptyState>
        <Button variant="secondary" title="Zum Haushalt" onPress={() => router.replace('/household')} />
      </ScrollView>
    );
  }

  const onScanned = (data: string) => {
    const info = parsePairingLink(data);
    if (!info) {
      setError('Das ist kein QR-Code von Zauberjournal.');
      return false;
    }
    setServerUrl(info.serverUrl);
    setCode(info.code);
    setError(null);
    setScanning(false);
    return true;
  };

  const submit = async () => {
    if (!serverUrl.trim() || !code.trim() || !deviceName.trim()) {
      setError('Bitte alle Felder ausfüllen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await connect(await joinHousehold(normalizeServerUrl(serverUrl), code, deviceName.trim()));
      if (router.canGoBack()) router.back();
      else router.replace('/household');
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Haushalt beitreten' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {scanning ? (
          <QrScanner onScanned={onScanned} onCancel={() => setScanning(false)} />
        ) : (
          <Button variant="secondary" icon="qr_code_scanner" title="QR-Code scannen" onPress={() => setScanning(true)} />
        )}
        <Hint>Oder Serveradresse und Einladungscode vom anderen Gerät abtippen.</Hint>
        <TextField
          label="Server-Adresse"
          icon="dns"
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="https://kochbuch.example.de"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TextField
          label="Einladungscode"
          icon="qr_code"
          value={code}
          onChangeText={setCode}
          placeholder="z. B. 93ZK-JDE6"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TextField label="Name dieses Geräts" icon="smartphone" value={deviceName} onChangeText={setDeviceName} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button icon="group_add" title={busy ? 'Verbinde …' : 'Beitreten'} disabled={busy} onPress={() => void submit()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
});
