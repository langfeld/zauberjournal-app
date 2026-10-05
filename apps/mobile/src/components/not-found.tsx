import { router, Stack, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { spacing, tones } from '@/theme';

import { Button, EmptyState } from './ui';

type NotFoundProps = { message?: string; backLabel?: string; href?: Href };

export function NotFound({
  message = 'Dieses Rezept gibt es nicht (mehr).',
  backLabel = 'Zur Rezeptliste',
  href = '/',
}: NotFoundProps) {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Nicht gefunden' }} />
      <EmptyState icon="search" title="Nicht gefunden" tone={tones.stone}>
        {message}
      </EmptyState>
      <Button variant="secondary" title={backLabel} onPress={() => router.navigate(href)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
});
