import { formatCode } from '@zauberjournal/core';
import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { createInvite, userscriptUrl } from '@/data/api';
import { useConnection } from '@/data/connection';
import { errorMessage } from '@/lib/error-message';
import { colors, fonts, radius, spacing } from '@/theme';

import { Button, Card, Hint, Notice } from './ui';

/** Ein Schritt der Anleitung, mit Nummer. */
function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <Card>
      <View style={styles.stepHeader}>
        <View style={styles.stepNumber}>
          <Text style={styles.stepNumberText}>{number}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.stepTitle}>
          {title}
        </Text>
      </View>
      {children}
    </Card>
  );
}

/**
 * Anleitung fürs REWE-Userscript: Link zum Installieren und ein Code, mit dem es sich wie ein Gerät koppelt.
 * Als Route in Haushalt und Einkauf.
 */
export function ReweUserscriptScreen() {
  const { credentials } = useConnection();
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!credentials) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Userscript einrichten' }} />
        <Notice>Das Userscript braucht die Verbindung zum Haushalt.</Notice>
      </ScrollView>
    );
  }

  const url = userscriptUrl(credentials);
  const open = () => {
    Linking.openURL(url).catch(() => setError('Der Link ließ sich nicht öffnen. Teil ihn stattdessen.'));
  };
  // Abbrechen oder ein Browser ohne Teilen ist kein Fehler; der Link steht auch zum Kopieren da.
  const share = () => {
    Share.share({ message: url }).catch(() => {});
  };
  const showCode = async () => {
    setLoading(true);
    setError(null);
    try {
      setInvite(await createInvite(credentials));
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setLoading(false);
    }
  };
  const validUntil = invite
    ? new Date(invite.expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Userscript einrichten' }} />
      <Text style={styles.body}>
        Das Userscript legt eure Einkaufsliste auf rewe.de in den Warenkorb. Es läuft im Browser, am PC oder in Firefox auf
        dem Handy.
      </Text>

      <Step number={1} title="Userscript-Manager installieren">
        <Text style={styles.body}>
          Im Browser die Erweiterung Violentmonkey oder Tampermonkey installieren. Auf dem Handy geht das in Firefox.
        </Text>
      </Step>

      <Step number={2} title="Userscript installieren">
        <Text style={styles.body}>Diesen Link im selben Browser öffnen. Der Userscript-Manager bietet dann die Installation an.</Text>
        <Text style={styles.url} selectable>
          {url}
        </Text>
        <View style={styles.actions}>
          <Button small icon="open_in_new" title="Öffnen" onPress={open} />
          <Button small variant="secondary" icon="share" title="Teilen" onPress={share} />
        </View>
        <Hint>„Öffnen“ nimmt den Standardbrowser. Für Firefox oder den PC den Link teilen.</Hint>
      </Step>

      <Step number={3} title="Mit dem Haushalt verbinden">
        <Text style={styles.body}>
          Auf rewe.de unten rechts den grünen Knopf des Userscripts antippen und einen Code von hier eingeben. Die
          Serveradresse ist schon eingetragen.
        </Text>
        {invite ? (
          <View style={styles.codeBox}>
            <Text style={styles.code} selectable>
              {formatCode(invite.code)}
            </Text>
            <Text style={styles.meta}>Gültig bis {validUntil} Uhr, nur einmal verwendbar.</Text>
          </View>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Button
            small
            variant={invite ? 'secondary' : 'primary'}
            icon={invite ? 'sync' : 'link'}
            title={invite ? 'Neuen Code erzeugen' : 'Code anzeigen'}
            onPress={() => void showCode()}
          />
        )}
        <Text style={styles.meta} selectable>
          Server: {credentials.serverUrl}
        </Text>
      </Step>

      <Hint>Danach steht das Userscript unter „Geräte“ und lässt sich dort wieder entfernen.</Hint>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  stepNumberText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  stepTitle: { flex: 1, fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.text },
  url: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  codeBox: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  code: { fontFamily: fonts.display, fontSize: 32, lineHeight: 40, letterSpacing: 2, color: colors.text },
});
