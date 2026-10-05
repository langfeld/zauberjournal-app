import { countReweOrder, formatPrice, type ReweOrder, type ShoppingListRewe } from '@zauberjournal/core';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { ReweMatchProgress } from '@/data/rewe-match';
import type { ReweSettings } from '@/data/tables';
import { colors, fonts, spacing, tones } from '@/theme';

import { Icon } from './icon';
import { Button, Card, Hint, IconCircle, Notice, ProgressBar, Tag } from './ui';

type ReweListCardProps = {
  summary: ShoppingListRewe;
  settings: ReweSettings;
  progress: ReweMatchProgress | null;
  error: string | null;
  onMatch: () => void;
  /** Auftrag fürs Userscript zu dieser Liste, falls es einen gibt. */
  order: ReweOrder | null;
  sending: boolean;
  onSend: () => void;
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

/** Wie weit das Userscript mit dem Warenkorb ist. */
function CartStatus({ order, sending, onSend }: { order: ReweOrder | null; sending: boolean; onSend: () => void }) {
  if (!order) {
    return (
      <View style={styles.cart}>
        <Button small icon="add_shopping_cart" title="In den Warenkorb" disabled={sending} onPress={onSend} />
        <Hint>Das Userscript legt die Produkte danach auf rewe.de in den Warenkorb.</Hint>
      </View>
    );
  }
  const counts = countReweOrder(order);
  const inBasket = counts.added + counts.present;
  const total = order.products.length;
  return (
    <View style={styles.cart}>
      <View style={styles.cartRow}>
        <Icon name="shopping_cart" size={20} color={counts.pending === 0 && counts.failed === 0 ? colors.primary : colors.textMuted} />
        <Text style={styles.cartTitle}>
          {counts.pending === total ? `${total} Produkte bereit fürs Userscript` : `${inBasket} von ${total} im Warenkorb`}
        </Text>
      </View>
      {counts.failed > 0 ? <Tag icon="error" label={`${counts.failed} nicht geklappt`} tone={tones.rose} /> : null}
      <Hint>
        {counts.pending > 0
          ? 'Auf rewe.de den grünen Knopf des Userscripts antippen.'
          : counts.failed > 0
            ? 'Was nicht geklappt hat, bitte auf rewe.de selbst suchen.'
            : 'Alles liegt im Warenkorb.'}
      </Hint>
      <Button small variant="secondary" icon="add_shopping_cart" title="Neu schicken" disabled={sending} onPress={onSend} />
    </View>
  );
}

/** Produkte und Preis bei REWE für alles, was noch zu kaufen ist; Abgleich und Warenkorb. */
export function ReweListCard({ summary, settings, progress, error, onMatch, order, sending, onSend }: ReweListCardProps) {
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
            variant={matched ? 'secondary' : 'primary'}
            icon={matched ? 'refresh' : 'search'}
            title={matched ? 'Neu abgleichen' : 'Produkte suchen'}
            onPress={onMatch}
          />
          {summary.products > 0 ? <CartStatus order={order} sending={sending} onSend={onSend} /> : null}
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
  cart: {
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cartTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
});
