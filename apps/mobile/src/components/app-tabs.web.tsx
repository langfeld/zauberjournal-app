import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useConnection } from '@/data/connection';
import { colors, radius, spacing } from '@/theme';

import { Icon, type IconName } from './icon';
import { ATTENTION_TAB, TABS } from './tab-config';

type TabButtonProps = TabTriggerSlotProps & { icon: IconName; label: string; attention: boolean; ref?: Ref<View> };

function TabButton({ icon, label, attention, isFocused, ...props }: TabButtonProps) {
  const color = isFocused ? colors.primary : colors.textMuted;
  return (
    <Pressable {...props} accessibilityLabel={label} style={styles.tab}>
      <View style={[styles.indicator, isFocused && styles.indicatorActive]}>
        <Icon name={icon} size={24} color={color} />
        {attention ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>!</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, { color }, isFocused && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Im Browser gibt es keine native Tab-Leiste. Diese bildet die von Android nach,
 * damit die App beim Testen im Browser ähnlich aussieht wie auf dem Handy.
 */
export function AppTabs() {
  const { status } = useConnection();
  const attention = status === 'offline' || status === 'revoked';
  return (
    <Tabs style={styles.root}>
      <TabSlot />
      <TabList style={styles.bar}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton icon={tab.icon} label={tab.label} attention={tab.name === ATTENTION_TAB && attention} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: 'row',
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', gap: spacing.xs },
  indicator: { width: 56, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  indicatorActive: { backgroundColor: colors.primarySoft },
  label: { fontSize: 12, fontWeight: '500' },
  labelActive: { fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -2,
    right: 8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryText },
});
