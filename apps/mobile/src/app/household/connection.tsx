import { normalizeServerUrl, serverUrlProblem } from '@zauberjournal/core';
import { Redirect, router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Button, Card, Hint, Notice, TextField } from '@/components/ui';
import { checkServer } from '@/data/api';
import { useConnection } from '@/data/connection';
import { colors, spacing } from '@/theme';

/** So lange darf ein Server beim Prüfen brauchen; über Pangolin dauert es manchmal etwas. */
const CHECK_TIMEOUT_MS = 5000;

/** Adressen für unterwegs und zu Hause; die App wählt beim Verbinden selbst. */
export default function ConnectionScreen() {
  const { access, credentials, route, status, updateAddresses } = useConnection();
  const [serverUrl, setServerUrl] = useState(access?.serverUrl ?? '');
  const [homeUrl, setHomeUrl] = useState(access?.homeUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Was die Prüfung ergeben hat; speichern lässt es sich trotzdem. */
  const [warnings, setWarnings] = useState<string[]>([]);

  if (!access || !credentials) return <Redirect href="/household" />;

  const save = async (anyway: boolean) => {
    const away = normalizeServerUrl(serverUrl);
    const home = homeUrl.trim() ? normalizeServerUrl(homeUrl) : '';
    const problem = serverUrl.trim()
      ? (serverUrlProblem(away) ?? (home ? serverUrlProblem(home) : null))
      : 'Bitte die Adresse für unterwegs eintragen.';
    setError(problem);
    setWarnings([]);
    if (problem) return;
    setBusy(true);
    try {
      if (!anyway) {
        const urls = home ? [away, home] : [away];
        const results = await Promise.all(urls.map((url) => checkServer({ ...access, serverUrl: url }, CHECK_TIMEOUT_MS)));
        const found = urls.flatMap((url, index) => {
          if (results[index] === 'unreachable') return [`${url} ist gerade nicht erreichbar.`];
          if (results[index] === 'foreign') return [`Unter ${url} antwortet nicht euer Server, oder er kennt dieses Gerät nicht.`];
          return [];
        });
        if (home && results[1] !== 'ok') found.push('Unterwegs ist die Adresse für zu Hause normalerweise nicht erreichbar.');
        if (found.length > 0) {
          setWarnings(found);
          return;
        }
      }
      await updateAddresses({ serverUrl: away, homeUrl: home });
      if (router.canGoBack()) router.back();
      else router.replace('/household');
    } finally {
      setBusy(false);
    }
  };

  const current =
    status === 'online'
      ? route === 'home'
        ? 'Verbunden über das WLAN zu Hause'
        : 'Verbunden über das Internet'
      : status === 'connecting'
        ? 'Verbinde …'
        : 'Gerade nicht verbunden';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Verbindung' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.current}>
            <Icon name={route === 'home' ? 'wifi' : 'public'} size={22} color={colors.primary} />
            <View style={styles.currentText}>
              <Text style={styles.currentLabel}>{current}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {credentials.serverUrl}
              </Text>
            </View>
          </View>
        </Card>
        <Text style={styles.body}>
          Ist das Handy zu Hause im WLAN, nimmt die App die Adresse für zu Hause, sonst die für unterwegs. Sie prüft das
          beim Öffnen und wenn die Verbindung abreißt.
        </Text>
        <TextField
          label="Unterwegs"
          icon="public"
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="https://kochbuch.example.de"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Hint>Über das Internet, z. B. über Pangolin.</Hint>
        <TextField
          label="Zu Hause"
          icon="wifi"
          value={homeUrl}
          onChangeText={setHomeUrl}
          placeholder="http://192.168.178.20:3000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Hint>
          Im WLAN zu Hause, meist die IP-Adresse des NAS mit dem Port des Servers. Leer lassen, wenn es keine gibt. Ohne
          Verschlüsselung (http://) geht nur eine Adresse im eigenen Netz.
        </Hint>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {warnings.length > 0 ? (
          <>
            <Notice tone="warning" title="Nicht geprüft">
              {warnings.join(' ')}
            </Notice>
            <Button variant="secondary" title="Trotzdem speichern" disabled={busy} onPress={() => void save(true)} />
          </>
        ) : null}
        <Button icon="check" title={busy ? 'Prüfe …' : 'Speichern'} disabled={busy} onPress={() => void save(false)} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  current: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  currentText: { flex: 1, gap: 1 },
  currentLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
});
