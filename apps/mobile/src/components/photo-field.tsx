import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { savePhoto } from '@/data/photos';
import { errorMessage } from '@/lib/error-message';
import { pickImages } from '@/lib/images';
import { colors, radius, spacing } from '@/theme';

import { RecipePhoto } from './recipe-photo';
import { Button } from './ui';

type PhotoFieldProps = { photoId: string; onChange: (photoId: string) => void };

/** Rezeptfoto im Editor: aufnehmen, aus der Galerie wählen oder entfernen. */
export function PhotoField({ photoId, onChange }: PhotoFieldProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const [image] = await pickImages(source);
      if (!image) return;
      setBusy(true);
      onChange(await savePhoto(image));
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.field}>
      {photoId ? (
        <RecipePhoto
          photoId={photoId}
          style={styles.photo}
          fallback={
            <View style={[styles.photo, styles.placeholder]}>
              <Text style={styles.placeholderText}>Das Foto erscheint, sobald der Server erreichbar ist.</Text>
            </View>
          }
        />
      ) : null}
      <View style={styles.actions}>
        <Button
          small
          variant="secondary"
          title={photoId ? 'Neues Foto' : 'Foto aufnehmen'}
          disabled={busy}
          onPress={() => void pick('camera')}
        />
        <Button
          small
          variant="secondary"
          title={photoId ? 'Galerie' : 'Aus Galerie'}
          accessibilityLabel="Foto aus der Galerie wählen"
          disabled={busy}
          onPress={() => void pick('library')}
        />
        {photoId ? (
          <Button
            small
            variant="ghost"
            title="Entfernen"
            accessibilityLabel="Foto entfernen"
            disabled={busy}
            onPress={() => onChange('')}
          />
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  photo: { width: '100%', height: 200, borderRadius: radius.md },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.primarySoft,
  },
  placeholderText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { fontSize: 15, color: colors.danger },
});
