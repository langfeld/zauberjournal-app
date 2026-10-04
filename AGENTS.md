# Hinweise für KI-Agenten

Private Android-Kochbuch-App (Expo) mit NAS-Dienst (Node) für einen Haushalt. Vor größeren Änderungen `docs/KONZEPT.md` lesen.

## Grundsätze

- Komplett neues Projekt: Das alte Web-Zauberjournal (`~/Webentwicklung/zauberjournal*`) ist keine Vorlage. Nicht lesen, nichts übernehmen.
- Texte in der Oberfläche, Kommentare und Fehlermeldungen auf Deutsch, Bezeichner im Code auf Englisch.
- Einfach halten: nur bauen, was die aktuelle Ausbaustufe braucht.

## Struktur

- `apps/mobile`: Expo-App. Vorher `apps/mobile/AGENTS.md` lesen: Expo ändert sich mit jeder SDK-Version, deshalb die versionierte Doku prüfen. Abhängigkeiten nur mit `npx expo install` hinzufügen.
- `apps/server`: NAS-Dienst (Node 24, Hono).
- `packages/core`: gemeinsame Logik ohne Abhängigkeit zu React oder Node-APIs.

## TypeScript ohne Build-Schritt

Server und `core` laufen direkt mit Node 24, das die Typen beim Ausführen entfernt. Deshalb:

- nur Syntax, die sich einfach entfernen lässt: keine `enum`, keine `namespace`, keine Parameter-Properties
- relative Importe mit `.ts`-Endung
- reine Typ-Importe mit `import type`

## Datenmodell und Sync (siehe Konzept, Abschnitt 5.2)

- IDs sind zufällige Zeichenketten.
- Löschen als Soft-Delete über `deletedAt`.
- Vorratsmengen als Buchungen (+/−), nie als absolute Werte.
- Reihenfolgen über Sortierschlüssel.
- Keine verschachtelten Objekte in Zellen.

## Besonderheiten

- `overrides` im Root-`package.json`: TinyBase verlangt React ≥ 19.3, Expo SDK 57 bringt 19.2.3 mit. TinyBase nutzt nur Standard-Hooks, deshalb ist das unkritisch. Den Eintrag entfernen, sobald Expo nachzieht.
- `apps/mobile/src/data/persister.web.ts` speichert im Browser in `localStorage`. Das dient nur dazu, die App im Browser zu testen (`npm run dev:app`, dann `w`).

## Befehle (im Repo-Root)

```bash
npm install
npm run dev:server
npm run dev:app
npm run typecheck
npm test
```

Bevor eine Aufgabe als fertig gilt, müssen `npm run typecheck` und `npm test` grün sein.
