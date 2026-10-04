import { Image, type ImageStyle } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp } from 'react-native';

import { useConnection } from '@/data/connection';
import { photoSource } from '@/data/photos';
import { colors, radius } from '@/theme';

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

/** Kleines Vorschaubild für Listen; ohne Foto der Anfangsbuchstabe des Titels. */
export function RecipeThumbnail({ photoId, title, size = 64 }: { photoId: string; title: string; size?: number }) {
  const box = { width: size, height: size };
  return (
    <RecipePhoto
      photoId={photoId}
      style={[styles.thumbnail, box]}
      alt=""
      fallback={
        <View style={[styles.thumbnail, styles.initial, box]}>
          <Text style={[styles.initialText, { fontSize: size * 0.375 }]}>
            {title.trim().charAt(0).toLocaleUpperCase('de') || '?'}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  thumbnail: { borderRadius: radius.sm },
  initial: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  initialText: { fontWeight: '700', color: colors.primary },
});
