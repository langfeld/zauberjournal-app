# Zauberjournal – Konzept

Stand: 4. Oktober 2026 · Status: Entwurf zur Abstimmung

## 1. Ziel

Eine private Android-App für einen Haushalt mit zwei Personen. Man sammelt darin Rezepte, plant die Mahlzeiten und kauft über den REWE-Abholservice ein. Der Vorrat ist dabei immer im Blick. Die Daten liegen auf dem eigenen NAS, und die App funktioniert auch offline.

Vorerst nicht geplant sind: iOS, Play Store, Betrieb für fremde Haushalte und eine offizielle REWE-Partnerschaft.

## 2. Rahmenbedingungen

- Zwei Android-Handys in einem Haushalt. Eine Person isst vegetarisch, die andere alles.
- Der Server läuft per Docker auf TrueNAS und ist über Pangolin/Newt erreichbar.
- KI läuft über Requesty (OpenAI-kompatibel). Der API-Schlüssel liegt nur auf dem Server.
- Die App ist nur für den privaten Gebrauch, eventuell später Open Source. Deshalb kommen keine Geheimnisse ins Repo.
- Die Oberfläche ist deutsch, der Code TypeScript.

## 3. Hauptablauf

1. **Rezepte sammeln:** per Foto, Link oder manuell.
2. **Planen:** Beliebig viele Gerichte in einem rollierenden Zeitraum, also ohne feste Kalenderwochen. Standard ist nur das Abendessen; weitere Mahlzeiten lassen sich in den Einstellungen zuschalten. Pro Mahlzeit wird festgelegt, wer mitisst und welche Option jede Person bekommt (z. B. Hähnchen oder Halloumi).
3. **Einkaufsliste erzeugen:** aus ausgewählten Planeinträgen. Die Mengen werden zusammengefasst, der Vorrat wird abgezogen, eigene Zusatzartikel kommen dazu.
4. **REWE-Abgleich:** Für jede Position wird ein passendes REWE-Produkt gesucht. Gelernte Stammprodukte haben Vorrang, danach folgt eine Suche mit Filtern. Unsichere Treffer sind markiert, Alternativen lassen sich auswählen.
5. **Einkaufen:** rewe.de öffnen, am PC oder in Firefox auf dem Handy. Das Userscript legt alles in den Warenkorb und meldet das Ergebnis zurück.
6. **Vorrat pflegen:** Nach der Abholung wird der Einkauf in den Vorrat gebucht, beim Kochen wird wieder abgebucht.

## 4. Ausbaustufen

| Stufe | Inhalt | Ergebnis |
|---|---|---|
| **M0 Fundament** | Monorepo, Expo-App, Server-Grundgerüst, gemeinsames Paket, Tests | läuft lokal ✅ |
| **M1 Rezepte** | Datenmodell, Rezeptliste, Detailansicht, Editor inkl. Wahlkomponenten, Portionen skalieren, lokale Speicherung | App auf dem Handy nutzbar (Expo Go) ✅ |
| **M2 Haushalt & Sync** | Sync-Server als Docker-Container auf TrueNAS, Pairing per QR-Code, Gerätetokens, Zugang über Pangolin, APK-Build per GitHub Actions | beide Handys synchron, App fest installiert ✅ (umgesetzt; Inbetriebnahme siehe [BETRIEB.md](BETRIEB.md)) |
| **M3 Import & Fotos** | Foto, Screenshot, Link oder Text wird per Requesty zum Rezept; Prüfansicht; Zuordnung der Zutaten; Rezeptfotos als Dateien über den Server | Rezepte schnell erfasst |
| **M4 Planen & Einkaufen** | Plan in Wochen- und Monatsansicht (rollierend), Esser und Optionen pro Mahlzeit, Einkaufsliste erzeugen, einfacher Vorrat, Abhaken | Hauptablauf ohne REWE |
| **M5 REWE** | Produktquelle, Abgleich mit Lernen, Auswahl in der App, neues Userscript mit Rückmeldung | Warenkorb wird befüllt |
| **M6 Vorrat & Nährwerte** | Buchungen, Mindesthaltbarkeit, Erfassungsstufen, BLS-Nährwerte pro Person, Vegetarisch-Prüfung | „intelligenter“ Vorrat |
| **M7 Übernahme** | Bestehende Rezepte aus einem Export des alten Systems importieren | alle Rezepte im neuen System |
| **Später** | Kochmodus mit Timern, Planvorschläge, Angebote, Widgets, Web-Ansicht am PC, direkter Sync im WLAN | |

Die Reihenfolge von M3 bis M5 lässt sich tauschen. M3 steht vorne, weil alles Weitere auf Rezepten aufbaut.

## 5. Architektur

```
┌──────────── Handy (Expo-App) ───────────────┐
│  Oberfläche (Expo Router)                   │
│  TinyBase-Store ──► expo-sqlite (lokal)     │
│        │  WebSocket-Sync                    │
└────────┼────────────────────────────────────┘
         ▼
   Pangolin (HTTPS, eigene Subdomain)
         ▼
┌──────────── NAS-Dienst (Docker) ────────────┐
│  Hono (HTTP-API) + TinyBase-WsServer        │
│  node:sqlite: Haushaltsdaten, Geräte        │
│  Dateien: Fotos (Name = Hash des Inhalts)   │
│  KI-Import (Requesty), REWE-Abgleich,       │
│  BLS-Nährwerte                              │
└───────────────────▲─────────────────────────┘
                    │  HTTPS mit Gerätetoken
      Userscript auf rewe.de (PC oder Firefox Android)
```

### 5.1 Repository

```
apps/mobile      Expo-App (React Native, Expo Router)
apps/server      NAS-Dienst (Node 24, Hono)
packages/core    gemeinsame Logik: Schema, Mengen und Einheiten,
                 Einkaufslisten-Berechnung, Bewertung beim REWE-Abgleich
userscript/      REWE-Userscript (ab M5)
docs/            Konzept und Entscheidungen
```

Das Repo nutzt npm-Workspaces. Server und `core` brauchen keinen Build-Schritt: Node 24 führt TypeScript direkt aus, in der App übernimmt das Metro. Dafür gilt: nur TypeScript-Syntax, die sich einfach entfernen lässt (keine `enum`, keine `namespace`), und relative Importe mit `.ts`-Endung.

### 5.2 Daten und Sync (local-first)

- **Ein Store pro Haushalt:** Jeder Haushalt ist ein TinyBase-`MergeableStore`. Jede Zelle trägt einen hybriden Zeitstempel. Beim Zusammenführen gewinnt pro Feld die letzte Änderung.
- **App:** Der Store liegt im Speicher und wird in expo-sqlite gesichert. Die App funktioniert vollständig offline.
- **Server:** Er hält denselben Store pro Haushalt und speichert ihn mit `node:sqlite`. Der Server ist ein normaler Teilnehmer. Er kann also selbst lesen und schreiben, zum Beispiel Ergebnisse des REWE-Abgleichs.
- **Transport:** WebSocket über Pangolin. Beim Verbindungsaufbau prüft der Server das Gerätetoken und bestimmt den Haushalt selbst. Ein Client kann keinen fremden Haushalt wählen.
- **Regeln fürs Datenmodell,** damit beim Sync möglichst wenig Konflikte entstehen:
  - IDs sind zufällige Zeichenketten, keine fortlaufenden Nummern.
  - Hauptobjekte werden nicht gelöscht, sondern mit `deletedAt` markiert. Sonst kann eine gleichzeitige Bearbeitung „halbe“ Zeilen erzeugen.
  - Vorratsmengen werden als Buchungen (+/−) gespeichert, nicht als absolute Werte.
  - Reihenfolgen laufen über Sortierschlüssel (Bruchindex), nicht über Positionsnummern.
  - Zellen enthalten keine verschachtelten Objekte. Listen bekommen eigene Tabellen.
- **Fotos** laufen nicht über den Store, sondern als Dateien: Der Dateiname ist der Hash des Inhalts, Upload und Download gehen über HTTP. Im Store steht nur der Hash.
- **Referenzdaten** wie BLS-Nährwerte und Kategorien sind schreibgeschützt. Sie kommen als eigene SQLite-Datei vom Server.

### 5.3 Aufgaben des Servers

1. Sync per WebSocket und Speicherung pro Haushalt.
2. Pairing und Geräte: Haushalt anlegen, Einladung per QR-Code, Gerätetokens ausstellen und widerrufen.
3. Fotos speichern und ausliefern.
4. KI-Import über Requesty.
5. REWE: Produktsuche, Abgleich, Auftrag fürs Userscript, Rückmeldung.
6. Referenzdaten (BLS) aufbereiten und ausliefern.

Alle Daten liegen in einem Volume `/data`. Dafür bekommt der Server ein eigenes TrueNAS-Dataset, dessen ZFS-Snapshots als Backup dienen.

### 5.4 Zugriff und Sicherheit

- **Pangolin:** Die API bekommt eine eigene Subdomain, dort **ohne** Pangolin-Login. Dessen Anmeldeseite können weder App noch Userscript bedienen. Abgesichert wird im Dienst selbst: Jedes Gerät hat ein eigenes Token, das sich widerrufen lässt. Pangolin selbst aktuell halten.
- **Pairing:** Ein Server gehört genau einem Haushalt. Das erste Handy richtet ihn mit dem Einrichtungscode ein, den der Server beim Start in sein Protokoll schreibt. Weitere Geräte scannen einen QR-Code mit Server-URL und Einladung. Die Einladung gilt 15 Minuten und nur einmal. Für den Notfall erzeugt `cli.mjs invite` im Container einen Code.
- **Userscript:** Es bekommt ebenfalls ein Gerätetoken. Das Token wird in der App erzeugt und einmal im Script eingegeben. Im Script-Code steht kein Schlüssel.

## 6. Datenmodell (Store eines Haushalts)

Die Feldnamen sind vorläufig.

**Personen** (`members`): Name, Ernährungsform (`vegan` | `vegetarisch` | `alles`), streng vegetarisch (schließt auch Lab und Gelatine aus), Abneigungen.

**Lebensmittel** (`foods`): der zentrale Katalog, auf den alles verweist. Felder:
- Name, Synonyme, Warengruppe (für die Sortierung der Einkaufsliste)
- Basiseinheit (`g` | `ml` | `Stk`), Gramm pro Stück, Gramm pro ml
- BLS-Code, Ernährungsklasse (`vegan` | `vegetarisch` | `fleisch` | `fisch`), Hinweise (z. B. tierisches Lab)
- Erfassungsstufe im Vorrat, REWE-Suchbegriff, REWE-Ausschlusswörter

**Rezepte**
- `recipes`: Titel, Beschreibung, Basisportionen, Zeiten, Quelle, Foto-Hash, Tags, Notizen, `deletedAt`
- `recipeIngredients`: Rezept, Sortierschlüssel, Zeilenart (`ingredient` oder `heading`; Zwischenüberschriften wie „Für das Dressing“ sind eigene Zeilen), Menge und optionale Obergrenze bei Spannen („2–3“) für die Basisportionen, Einheit, Name, Zusatz („fein gehackt“), Option (leer = für alle). Ab M3 kommt das zugeordnete Lebensmittel dazu.
- `recipeSteps`: Rezept, Sortierschlüssel, Text, Option (leer = für alle)
- `choiceGroups`: Rezept, Name („Protein“)
- `choiceOptions`: Gruppe, Name („Hähnchen“), Sortierschlüssel. Die Ernährungsklasse wird aus den Zutaten berechnet.

**Planung**
- `planEntries`: Datum, Mahlzeit, Rezept oder Freitext, Status (`geplant` | `eingekauft` | `gekocht`), Einkaufsliste
- `planEaters`: Planeintrag, Person (leer = Gast), Portionen
- `planChoices`: Esser, Gruppe, gewählte Option

**Einkauf**
- `shoppingLists`: Name, Status (`offen` | `rewe` | `erledigt`), erstellt am
- `shoppingItems`: Liste, Lebensmittel, Text, Menge, Einheit, abgehakt, Herkunft (`plan` | `manuell`), REWE-Produkt, REWE-Anzahl, REWE-Status (`offen` | `vorgeschlagen` | `bestaetigt` | `im_warenkorb` | `fehler`), Preis
- `shoppingItemSources`: Position, Planeintrag, Menge. Daraus wird die Anzeige „für Lasagne, Mi“.

**Vorrat**
- `pantryStock`: Lebensmittel, Lagerort, Füllstand (bei grober Erfassung), Mindesthaltbarkeit, geöffnet am
- `pantryBookings`: Lebensmittel, Menge (+/−), Grund (`einkauf` | `gekocht` | `korrektur` | `verdorben`), Zeitpunkt, Bezug (Planeintrag oder Liste)

**REWE** (`reweProducts`, gelernte Zuordnungen): Lebensmittel, REWE-Produkt-ID, Name, Packungsgröße und Einheit, letzter Preis, bevorzugt, wie oft und wann zuletzt gewählt.

**Einstellungen** (TinyBase-Values): REWE-Markt-ID, PLZ, aktive Mahlzeiten (Standard: nur Abendessen), Standardportionen.

**Nur auf dem Server, nicht im Store:** Haushalte, Geräte und Tokens, Einladungen, Zwischenspeicher für REWE-Produkte, KI-Protokoll.

### 6.1 Geteilte Portionen (Wahlkomponenten)

Beispiel „Sättigender Salat“: Die Basis ist für alle gleich. Dazu kommt die Gruppe „Protein“ mit den Optionen Hähnchen (150 g pro Portion) und Halloumi (100 g pro Portion), jeweils mit eigenen Schritten.

- **Einplanen:** Die App wählt für jede Person automatisch. Eine vegetarische Person bekommt die erste vegetarische Option, alle anderen die erste Option. Die Wahl lässt sich ändern. Rezepte ohne Wahlkomponente haben einfach Portionen.
- **Einkaufsliste:** Die Basis wird mit der Summe aller Portionen multipliziert. Die Zutaten einer Option werden mit den Portionen der Personen multipliziert, die diese Option gewählt haben.
- **Kochansicht:** gemeinsame Schritte plus parallele Stränge. Dazu kommt der Hinweis, die vegetarische Komponente zuerst zu braten oder eigene Pfanne und eigenes Brett zu nehmen.
- **Vegetarisch geeignet** ist ein Rezept, wenn alle Basiszutaten vegetarisch sind und jede Gruppe mindestens eine vegetarische Option hat.

## 7. Berechnungen in `packages/core`, mit Tests

- **Umrechnen:** von der Einheit im Rezept in die Basiseinheit des Lebensmittels, über Stückgewicht, Dichte und eine Tabelle für EL, TL, Prise usw. Ist keine Umrechnung bekannt, bleibt die Position in der Originaleinheit und wird markiert. Lieber markieren als falsch rechnen.
- **Skalieren:** Menge × (Portionen / Basisportionen), mit sinnvoller Rundung: Stück auf halbe oder ganze, Gramm auf 5 oder 10 g.
- **Einkaufsliste:** Den Bedarf je Lebensmittel summieren, dann den Vorrat abziehen. Das geht nur bei genauer Erfassung; bei grober Erfassung erscheint stattdessen der Hinweis „prüfen“. Danach kommen die Zusatzartikel dazu, und die Quellen jeder Position werden gemerkt.
- **Nährwerte (M6):** Menge in Gramm × BLS-Wert pro 100 g, für jede Person passend zu ihren Optionen.

## 8. REWE

### 8.1 Abgleich

Die Genauigkeit kommt aus dem Lebensmittel-Katalog, nicht aus einer Freitextsuche. „Tomaten (frisch)“, „Tomaten, getrocknet“ und „Tomaten, passiert“ sind verschiedene Lebensmittel, jeweils mit eigener Warengruppe, eigenem Suchbegriff und eigenen Ausschlusswörtern. Damit erledigt sich der Fall, dass für „Tomaten“ ein „Nudelgericht mit Tomatensoße“ vorgeschlagen wird.

Ablauf pro Position:
1. Gibt es ein gelerntes Stammprodukt, das im Markt verfügbar ist, wird es übernommen.
2. Sonst wird mit dem Suchbegriff des Lebensmittels gesucht. Die Kandidaten werden gefiltert: passende Kategorie, keine Ausschlusswörter, verträgliche Einheit.
3. Die übrigen Kandidaten werden bewertet nach:
   - Ähnlichkeit des Namens
   - REWE-Favorit oder schon einmal gekauft
   - Grundpreis
   - Packungsgröße passend zum Bedarf (der Rest wandert in den Vorrat)
   - Wunsch nach Bio oder regional
4. Ist das Ergebnis knapp oder unklar, wird die Position markiert. Optional prüft die KI alle unsicheren Positionen in einer gemeinsamen Anfrage.
5. Die Auswahl in der App (Alternativen oder eigene Suche) wird als Stammprodukt gelernt.

Die Bewertungslogik liegt in `packages/core` und wird mit echten Beispielen getestet, etwa dem Tomaten-Fall.

### 8.2 Produktquelle

**Entscheidung:** Der Server nutzt die Produktsuche der REWE-Website. So hat es das bisherige System gemacht, und das lief stabil. Die Suche wird als austauschbarer Adapter umgesetzt. Falls REWE Anfragen vom Server künftig blockiert, ist die Rückfallebene eine Suche im Userscript direkt im Browser auf rewe.de. Die App-Schnittstelle mit extrahiertem Zertifikat (vgl. rewerse-engineering) wird nicht gebraucht.

**Technische Notizen** (inoffiziell, kann sich jederzeit ändern):
- **Produktsuche:** `GET https://www.rewe.de/shop/api/products?search=…&storeId=<Markt>&market=<Markt>&objectsPerPage=…&page=…&serviceTypes=PICKUP`
  - `storeId` und `market` werden beide gebraucht, sonst fehlen Preise und Verfügbarkeit.
  - Mit `Accept: */*` kommt eine flache Liste: `products[]` mit `productId`, `title`, `listing.currentRetailPrice` (in Cent), `listing.grammage` und `imageURL`.
  - Mit `Accept: application/json` kommt stattdessen das verschachtelte HAL-Format.
- **Märkte zu einer PLZ:** `GET https://www.rewe.de/shop/api/marketselection/zipcodes/<PLZ>/services/pickup` liefert eine Liste mit `wwIdent` (Markt-ID), `displayName` und `isPickupStation`.
- **Verfügbarkeit eines Stammprodukts:** Einen Abruf per Produkt-ID kennen wir nicht. Geprüft wird, ob die ID in den Suchergebnissen zum Produktnamen auftaucht.
- **Zurückhaltend abfragen:** Ergebnisse auf dem Server zwischenspeichern und Anfragen nacheinander mit kurzen Pausen stellen.

### 8.3 Warenkorb per Userscript (neu geschrieben)

- Holt den Auftrag (Produkt-ID, Anzahl, Name, Preis) vom Server und meldet sich dabei mit seinem Gerätetoken an.
- Legt die Produkte über die Website in den Warenkorb. Das läuft auf dem bewährten Weg aus dem bisherigen Script: Produktseite → Listing-ID → Warenkorb-Endpunkt, mit Pausen zwischen den Artikeln.
- Meldet pro Artikel zurück, ob er im Warenkorb liegt, schon drin war oder ein Fehler auftrat. Die App zeigt den Status an.
- Läuft am PC und in Firefox für Android (Violentmonkey oder Tampermonkey). Die Oberfläche funktioniert auch auf schmalen Bildschirmen.
- Optional später: nach der Abholung die Bestellung auslesen und in den Vorrat buchen.

## 9. KI-Import (M3)

- **Eingabe:** ein oder mehrere Fotos, ein Screenshot, ein Link (wenn die Seite keine schema.org-Daten hat) oder Text.
- **Verarbeitung:** Der Server ruft Requesty mit einem Modell mit Bilderkennung und einem JSON-Schema auf. Das Modell ist per Konfiguration wählbar, bei einem Ausfall greift eine Fallback-Regel.
- **Ergebnis:** Titel, Portionen, Zeiten, Zutaten (Menge, Einheit, Name, Zusatz, Zwischenüberschrift), Schritte und unsichere Stellen.
- **Prüfansicht in der App:** Die Zutaten werden Lebensmitteln zugeordnet. Die App macht Vorschläge, und was einmal bestätigt ist, merkt sie sich.
- **Fleischrezepte:** Die KI schlägt eine vegetarische Wahlkomponente vor.
- **Modellwahl:** mit einem Testset aus 10 Fotos aus euren Kochbüchern 2–3 Modelle vergleichen.

## 10. Technik

| Bereich | Wahl | Grund |
|---|---|---|
| App | Expo SDK 57 (React Native 0.86), Expo Router | echte Android-App in TypeScript |
| Lokale Daten und Sync | TinyBase (`MergeableStore`, `WsSynchronizer`), expo-sqlite | Sync fertig gelöst, offline, reaktive Hooks |
| Server | Node 24, Hono, TinyBase-`WsServer`, `node:sqlite` | klein, TypeScript ohne Build-Schritt |
| Tests | Vitest | für `core` und Server |
| KI | Requesty (OpenAI-kompatibel) | Modellwahl, Fallbacks, JSON-Schema |
| Nährwerte | BLS 4.0 (CC BY 4.0) | kostenlos, deutsche Daten |
| Betrieb | Docker auf TrueNAS, Pangolin | schon vorhanden |
| Verteilung | APK per GitHub Actions, GitHub-Release, Obtainium; später optional Over-the-air-Updates | ohne Play Store und ohne lokale Android-Werkzeuge |

### 10.1 Bauen und Verteilen

- **Name:** Die App heißt „Zauberjournal“, der Android-Paketname ist `org.langfeld.zauberjournal`.
- **APK per GitHub Actions** (wie bisher): `expo prebuild` und Gradle laufen direkt im Runner, ein Expo-Konto ist nicht nötig. Die APK wird mit einem eigenen Schlüssel signiert, der als GitHub-Secret hinterlegt ist. Updates müssen immer mit demselben Schlüssel signiert sein, deshalb den Schlüssel zusätzlich sicher aufbewahren.
- **Auslöser:** Ein Versions-Tag (z. B. `v0.3.0`) erzeugt ein GitHub-Release mit der APK. Zusätzlich lässt sich der Build manuell starten.
- **Installation und Updates:** Obtainium auf beiden Handys beobachtet die GitHub-Releases und meldet neue Versionen. Da das Repo voraussichtlich öffentlich wird, braucht Obtainium dafür kein Token.
- **Seltener bauen (optional, später):** Mit Over-the-air-Updates (`expo-updates`) lädt die App geänderten JavaScript-Code beim Start nach. Eine neue APK braucht es dann nur noch, wenn sich nativer Code ändert, etwa durch eine neue native Bibliothek oder ein Expo-Upgrade. Gehostet würden die Updates entweder bei EAS Update (Expo-Cloud mit kostenlosem Kontingent; braucht ein Expo-Konto) oder selbst auf dem NAS nach dem offenen Expo-Updates-Protokoll.
- **Entwicklung:** Bis M1 reicht Expo Go auf dem Handy. Sobald native Module dazukommen, wird einmal ein Development-Build über dieselbe Action gebaut. Danach landen Code-Änderungen live per WLAN auf dem Handy, ohne neuen Build.

## 11. Risiken

- **REWE ändert Website oder Schnittstellen:** Adapter klein und austauschbar halten, die Warenkorb-Logik des Userscripts an einer Stelle bündeln.
- **Sync-Bibliothek:** TinyBase wird zu Beginn von M2 mit einem kurzen Prototyp geprüft. Getestet werden Anmeldung beim Verbindungsaufbau, Wiederverbindung am Handy und der Server als Teilnehmer. Die Rückfallebene ist ein eigenes Änderungsprotokoll mit denselben Regeln aus 5.2.
- **Expo-Upgrades:** regelmäßig in kleinen Schritten, mit `npx expo install --fix`.

## 12. Entscheidungen und offene Fragen

Entschieden am 4. Oktober 2026:
- **REWE-Produktquelle:** Website-Suche vom Server aus (8.2).
- **Mahlzeiten:** Standard ist nur das Abendessen, weitere sind zuschaltbar.
- **Bestehende Rezepte:** Sie kommen ganz am Ende als Export und werden dann importiert (M7).
- **Name:** „Zauberjournal“, Paketname `org.langfeld.zauberjournal`.
- **APK-Build:** per GitHub Actions (10.1).
- **GitHub-Repo:** voraussichtlich öffentlich.

Noch offen:
1. **Over-the-air-Updates:** ob und wo (EAS Update oder NAS). Das wird entschieden, wenn häufige APK-Builds lästig werden.
