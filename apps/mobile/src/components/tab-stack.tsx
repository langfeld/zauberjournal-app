import { Stack } from 'expo-router';

import { colors } from '@/theme';

/** Stack innerhalb eines Tabs, mit der Kopfzeile der App. */
export function TabStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
