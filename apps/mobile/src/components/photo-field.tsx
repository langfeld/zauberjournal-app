import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { savePhoto } from '@/data/photos';
import { errorMessage } from '@/lib/error-message';
import { pickImages } from '@/lib/images';
import { colors, radius, spacing, tones } from '@/theme';

import { RecipePhoto } from './recipe-photo';
import { Button, IconButton, IconCircle, Notice } from './ui';

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

  const actions = (
    <View style={styles.actions}>
      <Button
        small
        variant="secondary"
        icon="photo_camera"
        title={photoId ? 'Neues Foto' : 'Foto aufnehmen'}
        disabled={busy}
        onPress={() => void pick('camera')}
      />
      <Button
        small
        variant="secondary"
        icon="photo_library"
        title={photoId ? 'Galerie' : 'Aus Galerie'}
        accessibilityLabel="Foto aus der Galerie wählen"
        disabled={busy}
        onPress={() => void pick('library')}
      />
      {photoId ? (
        <IconButton icon="delete" variant="muted" size={36} accessibilityLabel="Foto entfernen" disabled={busy} onPress={() => onChange('')} />
      ) : null}
    </View>
  );

  return (
    <View style={styles.field}>
      {photoId ? (
        <>
          <RecipePhoto
            photoId={photoId}
            style={styles.photo}
            fallback={
              <View style={[styles.photo, styles.placeholder]}>
                <Text style={styles.placeholderText}>Das Foto erscheint, sobald der Server erreichbar ist.</Text>
              </View>
            }
          />
          {actions}
        </>
      ) : (
        <View style={styles.empty}>
          <IconCircle icon="photo_camera" tone={tones.terracotta} size={48} />
          <Text style={styles.placeholderText}>Ein Foto macht das Rezept in der Liste leichter zu finden.</Text>
          {actions}
        </View>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  photo: { width: '100%', height: 200, borderRadius: radius.lg },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surfaceSunken,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  placeholderText: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
