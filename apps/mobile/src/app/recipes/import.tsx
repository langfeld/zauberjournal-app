import { createId, IMPORT_LIMITS, importedRecipeToDraft, type RecipeDraft } from '@zauberjournal/core';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecipeEditor } from '@/components/recipe-editor';
import { Button, Card, Hint, SectionTitle, TextField } from '@/components/ui';
import { importRecipe } from '@/data/api';
import { useConnection } from '@/data/connection';
import { savePhoto } from '@/data/photos';
import { errorMessage } from '@/lib/error-message';
import { pickImages, resizeImage, type PickedImage } from '@/lib/images';
import { colors, radius, spacing } from '@/theme';

/** Bilder für die Erkennung: groß genug für die kleine Schrift in Kochbüchern. */
const IMPORT_MAX_SIDE = 2048;

type Review = { draft: RecipeDraft; notices: string[] };

export default function ImportRecipeScreen() {
  const { credentials } = useConnection();
  const [images, setImages] = useState<PickedImage[]>([]);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [suggestVegetarian, setSuggestVegetarian] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const request = useRef<AbortController | null>(null);

  // Wer den Bildschirm während der Erkennung verlässt, bricht sie ab.
  useEffect(() => () => request.current?.abort(), []);

  if (review) {
    return <RecipeEditor recipeId={null} initialDraft={review.draft} title="Rezept prüfen" notices={review.notices} dirty />;
  }

  const hasInput = images.length > 0 || url.trim() !== '' || text.trim() !== '';
  const full = images.length >= IMPORT_LIMITS.images;

  const addImages = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const picked = await pickImages(source, IMPORT_LIMITS.images - images.length);
      setImages((current) => [...current, ...picked].slice(0, IMPORT_LIMITS.images));
    } catch (problem) {
      setError(errorMessage(problem));
    }
  };

  const recognize = async () => {
    if (!credentials || !hasInput) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const encoded: string[] = [];
      for (const image of images) {
        const { base64 } = await resizeImage(image, IMPORT_MAX_SIDE, { base64: true });
        if (base64) encoded.push(base64);
      }
      const recipe = await importRecipe(
        credentials,
        { images: encoded, text: text.trim(), url: url.trim(), suggestVegetarian },
        controller.signal,
      );
      const draft = importedRecipeToDraft(recipe, createId);
      // Das erste Foto wird zum Rezeptfoto; im Editor lässt es sich ersetzen oder entfernen.
      if (images[0]) draft.photo = await savePhoto(images[0]).catch(() => '');

      const notices = [...recipe.uncertainties];
      const vegetarianOption = draft.groups[0]?.options[1]?.name;
      if (vegetarianOption) {
        notices.push(`Die vegetarische Option „${vegetarianOption}“ hat die KI vorgeschlagen. Mengen und Schritte bitte prüfen.`);
      }
      setReview({ draft, notices });
    } catch (problem) {
      if (!controller.signal.aborted) setError(errorMessage(problem));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Rezept importieren' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {credentials ? null : (
          <Card>
            <Text style={styles.cardTitle}>Erst mit dem Haushalt verbinden</Text>
            <Text style={styles.body}>Die Erkennung läuft über den Server deines Haushalts.</Text>
            <Button title="Zum Haushalt" onPress={() => router.push('/household')} />
          </Card>
        )}
        <Hint>
          Fotos aus dem Kochbuch, Screenshots, ein Link oder kopierter Text: Daraus wird ein Rezept, das du vor dem
          Speichern prüfst.
        </Hint>

        <SectionTitle>Fotos</SectionTitle>
        {images.length > 0 ? (
          <View style={styles.thumbnails}>
            {images.map((image, index) => (
              <View key={`${index}:${image.uri}`} style={styles.thumbnail}>
                <Image source={{ uri: image.uri }} style={styles.thumbnailImage} contentFit="cover" alt={`Foto ${index + 1}`} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Foto ${index + 1} entfernen`}
                  hitSlop={8}
                  disabled={busy}
                  onPress={() => setImages((current) => current.filter((_, other) => other !== index))}
                  style={styles.removeBadge}>
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.row}>
          <Button small variant="secondary" title="Foto aufnehmen" disabled={busy || full} onPress={() => void addImages('camera')} />
          <Button small variant="secondary" title="Aus Galerie" disabled={busy || full} onPress={() => void addImages('library')} />
        </View>
        <Hint>Bis zu {IMPORT_LIMITS.images} Bilder, z. B. wenn ein Rezept über zwei Seiten geht.</Hint>

        <SectionTitle>Link</SectionTitle>
        <TextField
          accessibilityLabel="Link zum Rezept"
          value={url}
          onChangeText={setUrl}
          placeholder="https://…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!busy}
        />

        <SectionTitle>Text</SectionTitle>
        <TextField
          accessibilityLabel="Rezepttext"
          multiline
          value={text}
          onChangeText={setText}
          placeholder="Rezepttext hier einfügen"
          editable={!busy}
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Vegetarische Option vorschlagen, wenn Fleisch oder Fisch drin ist</Text>
          <Switch
            accessibilityLabel="Vegetarische Option vorschlagen"
            value={suggestVegetarian}
            onValueChange={setSuggestVegetarian}
            disabled={busy}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.surface}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? (
          <View style={styles.busy} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.busyText}>Das Rezept wird erkannt. Das dauert meist 10 bis 30 Sekunden.</Text>
          </View>
        ) : null}
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <Button
            title={busy ? 'Wird erkannt …' : 'Rezept erkennen'}
            disabled={!credentials || !hasInput || busy}
            onPress={() => void recognize()}
          />
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const THUMBNAIL_SIZE = 88;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, lineHeight: 21, color: colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbnails: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbnail: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE },
  thumbnailImage: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, borderRadius: radius.md },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
  removeText: { fontSize: 18, lineHeight: 20, fontWeight: '700', color: colors.surface },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  switchLabel: { flex: 1, fontSize: 16, color: colors.text },
  error: { fontSize: 15, color: colors.danger },
  busy: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  busyText: { flex: 1, fontSize: 15, color: colors.textMuted },
  footer: { marginTop: spacing.md },
});
