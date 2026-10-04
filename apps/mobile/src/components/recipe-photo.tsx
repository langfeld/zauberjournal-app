import { Image, type ImageStyle } from 'expo-image';
import { useState, type ReactNode } from 'react';
import type { StyleProp } from 'react-native';

import { useConnection } from '@/data/connection';
import { photoSource } from '@/data/photos';

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
