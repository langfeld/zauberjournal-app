# Zauberjournal

Private Kochbuch-App für Android mit Wochenplan, Einkaufsliste, REWE-Anbindung und Vorrat. Die Daten liegen auf dem eigenen NAS.

Status: **M3 – Import & Fotos**. Konzept und Ausbaustufen: [docs/KONZEPT.md](docs/KONZEPT.md) · Server, Pangolin und App-Builds: [docs/BETRIEB.md](docs/BETRIEB.md)

## Aufbau

| Ordner | Inhalt |
|---|---|
| `apps/mobile` | Android-App (Expo, React Native) |
| `apps/server` | NAS-Dienst (Node 24, Hono) |
| `packages/core` | gemeinsame Logik für App und Server |

## Entwicklung

Voraussetzung ist Node 24.

```bash
npm install          # einmalig, im Repo-Root
npm run dev:server   # NAS-Dienst lokal, http://localhost:3000/api/health
npm run dev:app      # Expo-Entwicklungsserver; QR-Code mit Expo Go scannen
npm run typecheck    # Typprüfung aller Pakete
npm test             # Tests (Vitest)
```

### Auf dem Handy ausprobieren

1. Die App **Expo Go** aus dem Play Store installieren.
2. Handy und Rechner ins selbe WLAN bringen.
3. `npm run dev:app` starten und den QR-Code im Terminal mit Expo Go scannen.

Im Browser geht es auch: Im laufenden `npm run dev:app` die Taste `w` drücken. Die Daten liegen dann im Browser, getrennt vom Handy.
