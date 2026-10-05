import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useConnection } from '@/data/connection';
import { colors } from '@/theme';

import { ATTENTION_TAB, TABS } from './tab-config';

/** Native Tab-Leiste für Android und iOS. */
export function AppTabs() {
  const { status } = useConnection();
  // Nur bei Problemen: offline oder abgemeldet.
  const attention = status === 'offline' || status === 'revoked';
  return (
    <NativeTabs
      backgroundColor={colors.surface}
      tintColor={colors.primary}
      indicatorColor={colors.primarySoft}
      labelStyle={{ color: colors.textMuted }}>
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.icon} />
          {tab.name === ATTENTION_TAB && attention ? <NativeTabs.Trigger.Badge>!</NativeTabs.Trigger.Badge> : null}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
