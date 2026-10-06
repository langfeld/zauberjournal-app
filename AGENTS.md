# Hinweise für KI-Agenten

Private Android-Kochbuch-App (Expo) mit NAS-Dienst (Node) für einen Haushalt. Vor größeren Änderungen `docs/KONZEPT.md` lesen.

## Grundsätze

- Komplett neues Projekt: Das alte Web-Zauberjournal (`~/Webentwicklung/zauberjournal*`) ist keine Vorlage. Nicht lesen, nichts übernehmen.
- Texte in der Oberfläche, Kommentare und Fehlermeldungen auf Deutsch, Bezeichner im Code auf Englisch.
- Einfach halten: nur bauen, was die aktuelle Ausbaustufe braucht.

## Struktur

- `apps/mobile`: Expo-App. Vorher `apps/mobile/AGENTS.md` lesen: Expo ändert sich mit jeder SDK-Version, deshalb die versionierte Doku prüfen. Abhängigkeiten nur mit `npx expo install` hinzufügen. Aufbau: Native Tabs im Root-Layout (in SDK 57 noch `expo-router/unstable-native-tabs`), jeder Tab mit eigenem Stack (`(recipes)`, `plan`, `shopping`, `pantry`, `household`).
- `apps/server`: NAS-Dienst (Node 24, Hono).
- `packages/core`: gemeinsame Logik ohne Abhängigkeit zu React oder Node-APIs.
- `userscript/`: REWE-Userscript in reinem JavaScript ohne Build. Der Server liefert es unter `/rewe.user.js` aus und trägt dabei seine Adresse ein. Bei Änderungen `@version` erhöhen, sonst übernimmt der Userscript-Manager sie nicht.

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
- `apps/mobile/src/data/persister.web.ts` speichert im Browser in `localStorage`. Das dient nur dazu, die App im Browser zu testen (`npm run dev:app`, dann `w`). Dasselbe gilt für `credentials.web.ts`, `socket.web.ts` (dort geht das Token im Browser als URL-Parameter mit), `photos.web.ts` (neue Fotos bleiben bis zum Upload im Speicher) und `components/app-tabs.web.tsx` (Tab-Leiste im Stil von Android, weil die Web-Variante der Native Tabs die Kopfzeile verdeckt).
- Gestaltung: Farben, Schriften und Abstände stehen in `apps/mobile/src/theme.ts`, die Bausteine in `components/ui.tsx`. Icons kommen aus der Schrift Material Symbols (`components/icon.tsx`); neue Icons dort mit ihrem Code-Punkt eintragen. App-Icon, Startbild, Favicon und das Symbol der Benachrichtigungen erzeugt `scripts/create-app-icons.py` (braucht Pillow).
- KI-Import: Der Server spricht Requesty an (`apps/server/src/importer.ts`). Zum Entwickeln liest `npm run dev:server` den Schlüssel aus `apps/server/.env`. Tests ersetzen `fetch`, sie brauchen keinen Schlüssel.
- REWE: Der Server nutzt die inoffizielle Suche der REWE-Website (`apps/server/src/rewe.ts`), mit Zwischenspeicher und Pausen; Tests ersetzen `fetch`. Bewertung und Packungen stehen in `packages/core/src/rewe.ts`. Getestet wird mit echten Suchergebnissen in `packages/core/src/fixtures/rewe-products.json`. Ändert sich die Bewertung, müssen diese Fälle weiter stimmen. Die Marktwahl ist eine Komponente mit je einer Route in `household` und `shopping`, damit „Zurück“ im selben Tab bleibt.
- Lebensmittel-Katalog: Warengruppe und Ernährungsklasse kommen aus Schlüsselwörtern in `packages/core/src/food-catalog.ts`. Die Ernährungsklasse bestimmt die automatische vegetarische Option, deshalb neue Schlüsselwörter an echten Namen prüfen (gut geeignet: die BLS-Namen in `apps/server/src/data/bls.json`). Wörter, die nur nach Fleisch oder Fisch aussehen, stehen in `LOOKALIKES`. Gespeicherte Lebensmittel bessert `apps/mobile/src/data/food-diets.tsx` nach.
- Vorrat (M6): Der Bestand entsteht aus dem Einkauf. `packages/core/src/pantry.ts` rechnet ihn aus den Buchungen, samt Ablauf von Frischem; „immer im Haus“ (`foods.stock`) ist davon unabhängig. Einbuchen beim Abschließen der Liste und Abbuchen beim Kochen stehen in `pantry-bookings.ts`. Nach dem Plantag setzt `apps/mobile/src/data/auto-cook.tsx` eingekaufte Gerichte auf „gekocht“. Einkauf und Kochen buchen mit festen IDs, damit zwei Handys nichts doppelt zählen.
- Nährwerte (M6): Der Server schlägt sie nach (`apps/server/src/nutrition.ts`): Open Food Facts per EAN des REWE-Produkts, sonst ein BLS-Eintrag, den die KI aus Kandidaten der Namenssuche wählt. Tests ersetzen `fetch`. Den BLS-Auszug `apps/server/src/data/bls.json` erzeugt `scripts/create-bls-data.py` (braucht openpyxl). Die App schlägt im Hintergrund nach (`apps/mobile/src/data/nutrition-sync.tsx`) und merkt sich die Werte je Lebensmittel in `foodNutrition`; gerechnet wird in `packages/core/src/nutrition.ts`. Wo Werte stehen, müssen die Quellen genannt bleiben (BLS: CC BY 4.0, Open Food Facts: ODbL).
- Kochmodus (M8): Schritte, Zutaten je Schritt und Zeitangaben für Timer stehen in `packages/core/src/cooking.ts`, die Oberfläche in `components/cooking-mode.tsx` mit je einer Route im Plan (`plan/[id]/cook`) und bei den Rezepten (`recipes/[id]/cook`). Die Timer liegen im Speicher der App (`data/timers.ts`); ihr Alarm ist eine geplante Benachrichtigung (`data/alarm.ts`, im Browser `alarm.web.ts` ohne Alarm).
- Planvorschläge (M8): Die Bewertung steht in `packages/core/src/suggestions.ts` (`createPlanner` mit `suggest` für einen Tag und `draft` für mehrere); sie rechnet mit dem freien Vorrat aus Bestand, offenen Listen und geplanten Gerichten. Angezeigt werden sie mit `components/suggestion-card.tsx` beim Hinzufügen (`plan/add.tsx`) und unter `plan/suggest.tsx`. Wie lange Frisches zählt, sagt `shelfLifeDays` in `pantry.ts`.
- Lebensmittel zusammenführen: `mergeFoodGroup` in `packages/core/src/food-merge.ts` nimmt Namen, REWE-Produkte, Nährwerte, Vorrat und eigene Listenpositionen mit; „Dasselbe wie …“ und die KI-Suche nach Doppelten (`apps/server/src/food-duplicates.ts`, Seite `pantry/duplicates.tsx`) nutzen es. Neue KI-Aufrufe im Server gehen über `askJson` in `apps/server/src/ai.ts`.
- Rezeptansicht: `components/recipe-detail.tsx`, mit je einer Route bei den Rezepten und im Plan (`plan/recipe/[id]`, nur ansehen, damit „Zurück“ im Plan bleibt).
- Passt zu und Pause (M8): Felder und Hilfen in `packages/core/src/recipe-meals.ts`. Offene Rezepte ordnet die KI im Hintergrund zu (`apps/mobile/src/data/meal-sync.tsx`, Server `meal-classifier.ts`); was jemand festlegt (`mealsBy: 'person'`), überschreibt sie nie. Anzeige und Pause im Rezept: `components/recipe-plan-card.tsx`. Favoriten (`recipes.favorite`) setzt das Herz in der Kopfzeile der Rezeptansicht; in den Vorschlägen bringen sie einen kleinen Bonus. Kategorien und Favoriten des alten Systems liest `legacy-import.ts`; das Übernahme-Werkzeug trägt sie auch bei schon vorhandenen Rezepten nach (`--update-only` nur das).
- Übernahme aus dem alten System (M7): Das Exportformat liest `packages/core/src/legacy-import.ts`. Das Werkzeug `apps/server/src/import-legacy.ts` koppelt sich wie ein Gerät und schreibt über den Sync (Anleitung in `docs/BETRIEB.md`). Den Code des alten Projekts braucht es dafür nicht.
- Server: Ein Server hat genau einen Haushalt. Für das Docker-Image wird der Server mit esbuild zu `apps/server/dist/*.mjs` gebündelt (`npm run bundle -w @zauberjournal/server`); zum Entwickeln läuft er weiter direkt aus `src`.
- Betrieb, Pangolin und APK-Build: `docs/BETRIEB.md`. Die GitHub-Workflows liegen in `.github/workflows/`.

## Befehle (im Repo-Root)

```bash
npm install
npm run dev:server
npm run dev:app
npm run typecheck
npm test
```

Bevor eine Aufgabe als fertig gilt, müssen `npm run typecheck` und `npm test` grün sein.
