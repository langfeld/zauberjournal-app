import { router } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { useStore } from '@/data/store';
import { useReweSettings } from '@/data/tables';
import { colors, spacing, tones } from '@/theme';

import { Icon } from './icon';
import { Button, Card, IconCircle, SectionTitle } from './ui';

/** REWE-Markt und Bio-Vorliebe; gilt für alle Geräte des Haushalts. */
export function ReweSettings() {
  const store = useStore();
  const settings = useReweSettings();
  return (
    <>
      <SectionTitle>REWE-Abholung</SectionTitle>
      <Card>
        <View style={styles.market}>
          <IconCircle icon="storefront" tone={tones.rose} size={40} />
          <View style={styles.text}>
            <Text style={styles.name}>{settings.marketId ? settings.marketName : 'Kein Markt gewählt'}</Text>
            <Text style={styles.meta}>
              {settings.marketId ? settings.marketAddress : 'Mit Markt sucht die Einkaufsliste passende Produkte und Preise.'}
            </Text>
          </View>
        </View>
        <Button
          small
          variant="secondary"
          icon="storefront"
          title={settings.marketId ? 'Anderen Markt wählen' : 'Markt wählen'}
          onPress={() => router.push('/household/market')}
        />
        <View style={[styles.switchRow, styles.divider]}>
          <Icon name="eco" size={22} color={colors.textMuted} />
          <View style={styles.text}>
            <Text style={styles.switchLabel}>Bio bevorzugen</Text>
            <Text style={styles.meta}>Beim Abgleich haben Bio-Produkte Vorrang.</Text>
          </View>
          <Switch
            accessibilityLabel="Bio bevorzugen"
            value={settings.organic}
            onValueChange={(next) => {
              store?.setValue('reweOrganic', next);
            }}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            thumbColor={colors.surface}
          />
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  market: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  switchLabel: { fontSize: 16, color: colors.text },
});
