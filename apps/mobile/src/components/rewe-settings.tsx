import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useStore } from '@/data/store';
import { useReweSettings } from '@/data/tables';
import { colors, spacing, tones } from '@/theme';

import { Icon } from './icon';
import { Button, Card, IconCircle, SectionTitle } from './ui';

/** REWE-Markt und Bio-Vorliebe, gültig für alle Geräte des Haushalts; dazu der Weg zum Userscript. */
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
        <View style={[styles.row, styles.divider]}>
          <Icon name="eco" size={22} color={colors.textMuted} />
          <View style={styles.text}>
            <Text style={styles.label}>Bio bevorzugen</Text>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Userscript für rewe.de einrichten"
          onPress={() => router.push('/household/userscript')}
          style={({ pressed }) => [styles.row, styles.divider, pressed && styles.pressed]}>
          <Icon name="add_shopping_cart" size={22} color={colors.textMuted} />
          <View style={styles.text}>
            <Text style={styles.label}>Userscript für rewe.de</Text>
            <Text style={styles.meta}>Legt die Einkaufsliste in den REWE-Warenkorb, am PC oder in Firefox auf dem Handy.</Text>
          </View>
          <Icon name="chevron_right" size={22} color={colors.textMuted} />
        </Pressable>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  market: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  label: { fontSize: 16, color: colors.text },
});
