import { Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces/400Regular_Italic';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols/400Regular';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppTabs } from '@/components/app-tabs';
import { ConnectionProvider } from '@/data/connection';
import { createAppPersister } from '@/data/persister';
import { createAppStore, Provider, useCreateMergeableStore, useCreatePersister } from '@/data/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Die Namen müssen zu `fonts` in theme.ts passen.
  const [fontsLoaded, fontError] = useFonts({ Fraunces_600SemiBold, Fraunces_400Regular_Italic, MaterialSymbols_400Regular });
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
  // Lädt eine Schrift nicht, geht es mit der Systemschrift weiter.
  const ready = persister !== undefined && (fontsLoaded || fontError !== null);

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
