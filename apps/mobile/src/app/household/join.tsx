import { normalizeServerUrl, parsePairingLink, serverUrlProblem } from '@zauberjournal/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { QrScanner } from '@/components/qr-scanner';
import { Button, EmptyState, Hint, Notice, TextField } from '@/components/ui';
import { isZauberjournalServer, joinHousehold } from '@/data/api';
import { useConnection } from '@/data/connection';
import { suggestedDeviceName } from '@/lib/device-name';
import { errorMessage } from '@/lib/error-message';
import { spacing, tones } from '@/theme';

/** So lange darf die Adresse für zu Hause beim Beitreten brauchen. */
const HOME_TIMEOUT_MS = 2000;

export default function JoinScreen() {
  // Kommt auch über den Link aus dem QR-Code: zauberjournal://household/join?server=…&home=…&code=…
  const params = useLocalSearchParams<{ server?: string; home?: string; code?: string }>();
  const { credentials, connect } = useConnection();
  const [serverUrl, setServerUrl] = useState(params.server ?? '');
  // Nur aus dem QR-Code; abtippen lässt sie sich später unter „Haushalt → Verbindung“.
  const [homeUrl, setHomeUrl] = useState(params.home ?? '');
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
    setHomeUrl(info.homeUrl ?? '');
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
    const away = normalizeServerUrl(serverUrl);
    const invalid = serverUrlProblem(away);
    if (invalid) {
      setError(invalid);
      return;
    }
    const home = homeUrl && !serverUrlProblem(homeUrl) ? homeUrl : '';
    setBusy(true);
    setError(null);
    try {
      // Zu Hause klappt das Beitreten so auch ohne Internet.
      const base = home && (await isZauberjournalServer(home, HOME_TIMEOUT_MS)) ? home : away;
      const joined = await joinHousehold(base, code, deviceName.trim());
      await connect(home ? { ...joined, serverUrl: away, homeUrl: home } : { ...joined, serverUrl: away });
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
        {homeUrl ? <Hint>Dazu für zu Hause im WLAN: {homeUrl}</Hint> : null}
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
