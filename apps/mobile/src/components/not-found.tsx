import { router, Stack, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';

import { Button } from './ui';

type NotFoundProps = { message?: string; backLabel?: string; href?: Href };

export function NotFound({
  message = 'Dieses Rezept gibt es nicht (mehr).',
  backLabel = 'Zur Rezeptliste',
  href = '/',
}: NotFoundProps) {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Nicht gefunden' }} />
      <Text style={styles.title}>{message}</Text>
      <Button variant="secondary" title={backLabel} onPress={() => router.navigate(href)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  title: { fontSize: 17, color: colors.text, textAlign: 'center' },
});
