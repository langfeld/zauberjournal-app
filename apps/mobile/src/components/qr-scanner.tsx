import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Button } from './ui';

type QrScannerProps = {
  /** Gibt `false` zurück, wenn der Code nicht passt; dann wird weiter gescannt. */
  onScanned: (data: string) => boolean;
  onCancel: () => void;
};

export function QrScanner({ onScanned, onCancel }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>Zum Scannen des QR-Codes braucht die App Zugriff auf die Kamera.</Text>
        {permission.canAskAgain ? (
          <Button icon="photo_camera" title="Kamera erlauben" onPress={requestPermission} />
        ) : (
          <Text style={styles.text}>Bitte den Kamerazugriff in den Android-Einstellungen für Zauberjournal erlauben.</Text>
        )}
        <Button variant="ghost" title="Abbrechen" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (handled.current) return;
          handled.current = true;
          if (!onScanned(data)) setTimeout(() => (handled.current = false), 1500);
        }}
      />
      <Text style={styles.text}>Halte die Kamera auf den QR-Code des anderen Geräts.</Text>
      <Button variant="ghost" title="Abbrechen" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.md },
  camera: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden' },
  text: { fontSize: 15, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
});
