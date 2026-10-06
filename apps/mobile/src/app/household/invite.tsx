import { createPairingLink, formatCode } from '@zauberjournal/core';
import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button, Notice } from '@/components/ui';
import { createInvite } from '@/data/api';
import { useConnection } from '@/data/connection';
import { errorMessage } from '@/lib/error-message';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

export default function InviteScreen() {
  const { credentials, access } = useConnection();
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

  if (!credentials || !access) return <Redirect href="/household" />;

  const validUntil = invite
    ? new Date(invite.expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Gerät hinzufügen' }} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {invite ? (
        <>
          <View style={styles.qr}>
            <QRCode
              value={createPairingLink({ serverUrl: access.serverUrl, homeUrl: access.homeUrl, code: invite.code })}
              size={232}
              color={colors.text}
              backgroundColor={colors.surface}
            />
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
            Server: {access.serverUrl}
            {access.homeUrl ? `\nZu Hause: ${access.homeUrl}` : ''}
          </Text>
          <Button variant="secondary" icon="sync" title="Neuen Code erzeugen" onPress={() => setRound((value) => value + 1)} />
        </>
      ) : error ? null : (
        <ActivityIndicator color={colors.primary} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
  qr: {
    padding: spacing.xl,
    borderRadius: radius.lg + 6,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    boxShadow: shadows.raised,
  },
  code: { fontFamily: fonts.display, fontSize: 32, lineHeight: 40, letterSpacing: 2, color: colors.text, marginTop: spacing.sm },
  meta: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'center' },
});
