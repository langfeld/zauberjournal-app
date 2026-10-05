import { Image, type ImageStyle } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useConnection } from '@/data/connection';
import { photoSource } from '@/data/photos';
import { fonts, initialOf, toneFor } from '@/theme';

type RecipePhotoProps = {
  photoId: string;
  style: StyleProp<ImageStyle>;
  /** Steht da, wenn es kein Foto gibt oder es sich (noch) nicht laden lässt. */
  fallback?: ReactNode;
  alt?: string;
};

/** Zeigt ein Rezeptfoto vom Gerät oder vom Server. */
export function RecipePhoto({ photoId, style, fallback = null, alt = 'Rezeptfoto' }: RecipePhotoProps) {
  const { credentials } = useConnection();
  const [failedId, setFailedId] = useState<string | null>(null);
  const source = photoId ? photoSource(photoId, credentials) : null;

  if (!source || failedId === photoId) return fallback;
  return (
    <Image
      source={source}
      style={style}
      alt={alt}
      contentFit="cover"
      transition={150}
      recyclingKey={photoId}
      onError={() => setFailedId(photoId)}
    />
  );
}

/** Ohne Foto: der Anfangsbuchstabe des Titels auf einer Farbe, die zum Titel gehört. */
function Placeholder({ title, style, letterSize }: { title: string; style: StyleProp<ViewStyle>; letterSize: number }) {
  const tone = toneFor(title);
  return (
    <View style={[styles.placeholder, { backgroundColor: tone.background }, style]}>
      <Text style={[styles.letter, { color: tone.foreground, fontSize: letterSize, lineHeight: Math.round(letterSize * 1.25) }]}>
        {initialOf(title)}
      </Text>
    </View>
  );
}

/**
 * Foto über dem Platzhalter: Solange es lädt oder wenn es fehlt (etwa weil ein anderes Gerät
 * es noch nicht hochgeladen hat), bleibt der Anfangsbuchstabe sichtbar.
 */
function PhotoTile({ photoId, title, style, letterSize }: { photoId: string; title: string; style: ViewStyle; letterSize: number }) {
  return (
    <View style={[styles.tile, style]}>
      <Placeholder title={title} style={StyleSheet.absoluteFill} letterSize={letterSize} />
      {photoId ? <RecipePhoto photoId={photoId} style={StyleSheet.absoluteFill} alt="" /> : null}
    </View>
  );
}

/** Kleines Vorschaubild für Listen. */
export function RecipeThumbnail({ photoId, title, size = 64 }: { photoId: string; title: string; size?: number }) {
  return (
    <PhotoTile
      photoId={photoId}
      title={title}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }}
      letterSize={Math.round(size * 0.46)}
    />
  );
}

type RecipeCoverProps = { photoId: string; title: string; aspectRatio?: number; letterSize?: number };

/** Titelbild über die ganze Breite einer Karte. */
export function RecipeCover({ photoId, title, aspectRatio = 1, letterSize = 60 }: RecipeCoverProps) {
  return <PhotoTile photoId={photoId} title={title} style={{ width: '100%', aspectRatio }} letterSize={letterSize} />;
}

const styles = StyleSheet.create({
  tile: { overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  letter: { fontFamily: fonts.display },
});
