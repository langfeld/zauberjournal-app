import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Ergänzt app.json um die Versionsangaben aus dem Build:
 * APP_VERSION (z. B. „0.2.0“ aus dem Git-Tag) und APP_VERSION_CODE (fortlaufende Build-Nummer),
 * damit Android jede neue APK als Update erkennt.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Zauberjournal',
  slug: config.slug ?? 'zauberjournal',
  version: process.env.APP_VERSION ?? config.version,
  android: {
    ...config.android,
    versionCode: Number(process.env.APP_VERSION_CODE ?? 1),
  },
});
