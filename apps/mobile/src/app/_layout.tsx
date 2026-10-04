import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ConnectionProvider } from '@/data/connection';
import { createAppPersister } from '@/data/persister';
import { createAppStore, Provider, useCreateMergeableStore, useCreatePersister } from '@/data/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

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
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text },
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </ConnectionProvider>
    </Provider>
  );
}
