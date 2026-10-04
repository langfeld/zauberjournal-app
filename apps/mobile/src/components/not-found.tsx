import { router, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';

import { Button } from './ui';

export function NotFound() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Nicht gefunden' }} />
      <Text style={styles.title}>Dieses Rezept gibt es nicht (mehr).</Text>
      <Button variant="secondary" title="Zur Rezeptliste" onPress={() => router.navigate('/')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  title: { fontSize: 17, color: colors.text, textAlign: 'center' },
});
