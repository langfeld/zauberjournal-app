import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** Ein aufgenommenes oder ausgewähltes Bild. */
export type PickedImage = { uri: string; width: number; height: number };

/**
 * Öffnet Kamera oder Galerie und liefert die Bilder; bei Abbruch eine leere Liste.
 * Mit `limit` > 1 lassen sich in der Galerie mehrere Bilder auf einmal wählen.
 */
export async function pickImages(source: 'camera' | 'library', limit = 1): Promise<PickedImage[]> {
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        'Zauberjournal darf die Kamera nicht benutzen. Das lässt sich in den Android-Einstellungen unter Apps → Zauberjournal → Berechtigungen ändern.',
      );
    }
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
    });
  }
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset) => ({ uri: asset.uri, width: asset.width, height: asset.height }));
}

/** Verkleinert ein Bild auf höchstens `maxSide` Pixel an der längeren Seite und speichert es als JPEG im Cache. */
export async function resizeImage(image: PickedImage, maxSide: number, options: { base64?: boolean } = {}) {
  const context = ImageManipulator.manipulate(image.uri);
  const longest = Math.max(image.width, image.height);
  if (longest === 0 || longest > maxSide) {
    context.resize(image.height > image.width ? { width: null, height: maxSide } : { width: maxSide, height: null });
  }
  const rendered = await context.renderAsync();
  try {
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: options.base64 });
    // Im Browser kommt Base64 teils als Data-URL; der Server erwartet es ohne Präfix.
    return { ...result, base64: result.base64?.replace(/^data:[^,]*,/, '') };
  } finally {
    rendered.release();
    context.release();
  }
}
