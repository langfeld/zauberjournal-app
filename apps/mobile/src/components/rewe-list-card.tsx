import { formatPrice, type ShoppingListRewe } from '@zauberjournal/core';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { ReweMatchProgress } from '@/data/rewe-match';
import type { ReweSettings } from '@/data/tables';
import { colors, fonts, spacing, tones } from '@/theme';

import { Button, Card, Hint, IconCircle, Notice, ProgressBar, Tag } from './ui';

type ReweListCardProps = {
  summary: ShoppingListRewe;
  settings: ReweSettings;
  progress: ReweMatchProgress | null;
  error: string | null;
  onMatch: () => void;
};

function Header({ subtitle, children }: { subtitle: string; children?: ReactNode }) {
  return (
    <View style={styles.header}>
      <IconCircle icon="storefront" tone={tones.rose} size={40} />
      <View style={styles.headerText}>
        <Text accessibilityRole="header" style={styles.title}>
          REWE-Abholung
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** Produkte und Preis bei REWE für alles, was noch zu kaufen ist; startet den Abgleich. */
export function ReweListCard({ summary, settings, progress, error, onMatch }: ReweListCardProps) {
  if (!settings.marketId) {
    return (
      <Card>
        <Header subtitle="Noch kein Markt gewählt" />
        <Hint>Mit eurem Markt sucht die App zu jeder Position ein passendes Produkt und rechnet den Preis aus.</Hint>
        <Button small variant="secondary" icon="storefront" title="Markt wählen" onPress={() => router.push('/shopping/market')} />
      </Card>
    );
  }

  const matched = summary.products > 0 || summary.toCheck > 0;
  const open = summary.products + summary.toCheck + summary.pending > 0;
  return (
    <Card>
      <Header subtitle={settings.marketAddress || settings.marketName}>
        {summary.products > 0 ? (
          <View style={styles.total}>
            <Text style={styles.totalPrice}>{`ca. ${formatPrice(summary.total)}`}</Text>
            <Text style={styles.totalLabel}>{`${summary.products} ${summary.products === 1 ? 'Produkt' : 'Produkte'}`}</Text>
          </View>
        ) : null}
      </Header>
      {progress ? (
        <View style={styles.progress}>
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.progressText}>{`Suche bei REWE … ${progress.done} von ${progress.total}`}</Text>
          </View>
          <ProgressBar value={progress.done / progress.total} />
        </View>
      ) : open ? (
        <>
          {matched ? null : <Hint>Sucht zu jeder Position ein passendes Produkt. Unsichere Treffer sind markiert.</Hint>}
          {summary.toCheck > 0 || (matched && summary.pending > 0) ? (
            <View style={styles.tags}>
              {summary.toCheck > 0 ? <Tag icon="warning" label={`${summary.toCheck} prüfen`} tone={tones.ochre} /> : null}
              {matched && summary.pending > 0 ? <Tag label={`${summary.pending} neu`} tone={tones.stone} /> : null}
            </View>
          ) : null}
          <Button
            small
            variant={matched && summary.pending === 0 ? 'secondary' : 'primary'}
            icon={matched ? 'refresh' : 'search'}
            title={matched ? 'Neu abgleichen' : 'Produkte suchen'}
            onPress={onMatch}
          />
        </>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1, gap: 1 },
  title: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.text },
  subtitle: { fontSize: 13.5, color: colors.textMuted },
  total: { alignItems: 'flex-end' },
  totalPrice: { fontSize: 17, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  totalLabel: { fontSize: 12.5, color: colors.textMuted },
  progress: { gap: spacing.sm },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressText: { fontSize: 14, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
});
