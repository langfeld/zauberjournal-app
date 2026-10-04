import { createPairingLink, formatCode } from '@zauberjournal/core';
import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button } from '@/components/ui';
import { createInvite } from '@/data/api';
import { useConnection } from '@/data/connection';
import { errorMessage } from '@/lib/error-message';
import { colors, radius, spacing } from '@/theme';

export default function InviteScreen() {
  const { credentials } = useConnection();
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Hochzählen erzeugt einen neuen Code.
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    createInvite(credentials).then(
      (next) => {
        if (cancelled) return;
        setInvite(next);
        setError(null);
      },
      (problem: unknown) => {
        if (!cancelled) setError(errorMessage(problem));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [credentials, round]);

  if (!credentials) return <Redirect href="/household" />;

  const validUntil = invite
    ? new Date(invite.expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Gerät hinzufügen' }} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {invite ? (
        <>
          <View style={styles.qr}>
            <QRCode value={createPairingLink({ serverUrl: credentials.serverUrl, code: invite.code })} size={240} />
          </View>
          <Text style={styles.code} selectable>
            {formatCode(invite.code)}
          </Text>
          <Text style={styles.meta}>Gültig bis {validUntil} Uhr, nur einmal verwendbar.</Text>
          <Text style={styles.body}>
            Auf dem anderen Gerät: Zauberjournal öffnen → Haushalt → Beitreten → QR-Code scannen. Alternativ dort die
            Serveradresse und den Code eintippen.
          </Text>
          <Text style={styles.meta} selectable>
            Server: {credentials.serverUrl}
          </Text>
          <Button variant="secondary" title="Neuen Code erzeugen" onPress={() => setRound((value) => value + 1)} />
        </>
      ) : error ? null : (
        <ActivityIndicator color={colors.primary} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
  qr: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface },
  code: { fontSize: 28, fontWeight: '700', letterSpacing: 2, color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, color: colors.text, textAlign: 'center' },
  error: { fontSize: 15, color: colors.danger },
});
