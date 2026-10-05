import { Stack } from 'expo-router';

import { colors } from '@/theme';

import { HeaderRight, HeaderTitle } from './header';
import { SyncBadge } from './sync-status';

/** Stack innerhalb eines Tabs, mit der Kopfzeile der App. */
export function TabStack() {
  return (
    <Stack
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerTitle: ({ children }) => <HeaderTitle>{children}</HeaderTitle>,
        // Die Startseite jedes Tabs zeigt oben rechts, ob der Server erreichbar ist.
        headerRight:
          route.name === 'index'
            ? () => (
                <HeaderRight>
                  <SyncBadge />
                </HeaderRight>
              )
            : undefined,
        contentStyle: { backgroundColor: colors.background },
      })}
    />
  );
}
