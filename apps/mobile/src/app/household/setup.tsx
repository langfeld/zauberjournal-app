import { normalizeServerUrl, serverUrlProblem } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button, Hint, Notice, TextField } from '@/components/ui';
import { setupHousehold } from '@/data/api';
import { useConnection } from '@/data/connection';
import { suggestedDeviceName } from '@/lib/device-name';
import { errorMessage } from '@/lib/error-message';
import { spacing } from '@/theme';

export default function SetupScreen() {
  const { connect } = useConnection();
  const [serverUrl, setServerUrl] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [deviceName, setDeviceName] = useState(suggestedDeviceName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!serverUrl.trim() || !setupCode.trim() || !deviceName.trim()) {
      setError('Bitte alle Felder ausfüllen.');
      return;
    }
    const url = normalizeServerUrl(serverUrl);
    const invalid = serverUrlProblem(url);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await connect(await setupHousehold(url, setupCode, deviceName.trim()));
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
      <Stack.Screen options={{ title: 'Haushalt einrichten' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          label="Einrichtungscode"
          icon="qr_code"
          value={setupCode}
          onChangeText={setSetupCode}
          placeholder="z. B. YGWT-FY6M-FS9T"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Hint>
          Den Einrichtungscode schreibt der Server beim Start in sein Protokoll (TrueNAS: Apps → Zauberjournal → Logs).
          Er gilt nur für das erste Gerät.
        </Hint>
        <TextField label="Name dieses Geräts" icon="smartphone" value={deviceName} onChangeText={setDeviceName} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button
          icon="add_home"
          title={busy ? 'Verbinde …' : 'Haushalt einrichten'}
          disabled={busy}
          onPress={() => void submit()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
});
