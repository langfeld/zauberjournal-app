import type { ReweMarket } from '@zauberjournal/core';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { findReweMarkets } from '@/data/api';
import { useConnection } from '@/data/connection';
import { useStore } from '@/data/store';
import { useReweSettings } from '@/data/tables';
import { errorMessage } from '@/lib/error-message';
import { colors, spacing, tones } from '@/theme';

import { Icon } from './icon';
import { Card, Hint, IconButton, IconCircle, Notice, TextField } from './ui';

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/** REWE-Markt mit Abholung wählen; gilt für den ganzen Haushalt. Als Route in Haushalt und Einkauf. */
export function ReweMarketScreen() {
  const { credentials } = useConnection();
  const store = useStore();
  const settings = useReweSettings();
  const [zipCode, setZipCode] = useState(settings.marketAddress.match(/\b\d{5}\b/)?.[0] ?? '');
  const [markets, setMarkets] = useState<ReweMarket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!credentials) return;
    const zip = zipCode.trim();
    if (!/^\d{5}$/.test(zip)) {
      setError('Bitte eine Postleitzahl mit fünf Ziffern eingeben.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setMarkets(await findReweMarkets(credentials, zip));
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setLoading(false);
    }
  };

  const choose = (market: ReweMarket) => {
    if (!store) return;
    store.transaction(() => {
      store.setValue('reweMarketId', market.id);
      store.setValue('reweMarketName', market.name);
      store.setValue('reweMarketAddress', `${market.street}, ${market.zipCode} ${market.city}`);
    });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'REWE-Markt' }} />
      {credentials ? (
        <>
          <Hint>Der Markt, in dem ihr abholt. Sortiment und Preise im Abgleich kommen aus diesem Markt.</Hint>
          <TextField
            label="Postleitzahl"
            value={zipCode}
            onChangeText={setZipCode}
            placeholder="z. B. 12345"
            keyboardType="number-pad"
            maxLength={5}
            returnKeyType="search"
            onSubmitEditing={() => void search()}
            trailing={
              <IconButton icon="search" variant="primary" size={36} accessibilityLabel="Märkte suchen" onPress={() => void search()} />
            }
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
          {markets && markets.length === 0 ? <Hint>Hier gibt es keinen REWE-Markt mit Abholung.</Hint> : null}
          {markets && markets.length > 0 ? (
            <Card style={styles.list}>
              {markets.map((market, index) => {
                const selected = market.id === settings.marketId;
                return (
                  <Pressable
                    key={market.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${market.name}, ${market.street}, ${market.city}`}
                    onPress={() => choose(market)}
                    style={({ pressed }) => [styles.market, index > 0 && styles.divider, pressed && styles.pressed]}>
                    <IconCircle icon="storefront" tone={selected ? tones.green : tones.rose} size={40} />
                    <View style={styles.marketText}>
                      <Text style={styles.marketName}>{market.name}</Text>
                      <Text style={styles.meta}>{`${market.street}, ${market.zipCode} ${market.city}`}</Text>
                      <Text style={styles.meta}>{formatDistance(market.distance)}</Text>
                    </View>
                    {selected ? <Icon name="check_circle" size={24} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </Card>
          ) : null}
        </>
      ) : (
        <Notice>Die Suche läuft über euren Server. Verbinde dieses Gerät zuerst mit dem Haushalt.</Notice>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  list: { paddingVertical: spacing.xs, gap: 0 },
  market: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  marketText: { flex: 1, gap: 2 },
  marketName: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
});
