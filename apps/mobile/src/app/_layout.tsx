import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect } from 'react';

import { ConnectionProvider, useConnection } from '@/data/connection';
import { createAppPersister } from '@/data/persister';
import { createAppStore, Provider, useCreateMergeableStore, useCreatePersister } from '@/data/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

/** Die fünf Bereiche der App; jeder Tab hat seinen eigenen Stack mit Kopfzeile. */
function AppTabs() {
  const { status } = useConnection();
  const attention = status === 'offline' || status === 'revoked';
  return (
    <NativeTabs
      backgroundColor={colors.surface}
      tintColor={colors.primary}
      indicatorColor={colors.primarySoft}
      labelStyle={{ color: colors.textMuted }}>
      <NativeTabs.Trigger name="(recipes)">
        <NativeTabs.Trigger.Label>Rezepte</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="book" md="menu_book" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shopping">
        <NativeTabs.Trigger.Label>Einkauf</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="cart" md="shopping_cart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="pantry">
        <NativeTabs.Trigger.Label>Vorrat</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="refrigerator" md="kitchen" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="household">
        <NativeTabs.Trigger.Label>Haushalt</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" md="home" />
        {/* Nur bei Problemen: offline oder abgemeldet. */}
        {attention ? <NativeTabs.Trigger.Badge>!</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

export default function RootLayout() {
  const store = useCreateMergeableStore(createAppStore);
  const persister = useCreatePersister(
    store,
    async () => {
      const persister = createAppPersister(store);
      await persister.startAutoPersisting();
      return persister;
    },
    [],
  );
  const ready = persister !== undefined;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Provider store={store}>
      <ConnectionProvider store={store}>
        <StatusBar style="dark" />
        <AppTabs />
      </ConnectionProvider>
    </Provider>
  );
}
