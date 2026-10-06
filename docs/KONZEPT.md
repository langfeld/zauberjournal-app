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
4. **REWE-Abgleich:** Für jede Position wird ein passendes REWE-Produkt gesucht. Gemerkte Produkte haben Vorrang, in der Reihenfolge des Haushalts. Danach folgt eine Suche mit Filtern. Unsichere Treffer sind markiert, Alternativen lassen sich auswählen.
5. **Einkaufen:** rewe.de öffnen, am PC oder in Firefox auf dem Handy. Das Userscript legt alles in den Warenkorb und meldet das Ergebnis zurück.
6. **Vorrat pflegen:** Nach der Abholung wird der Einkauf in den Vorrat gebucht, beim Kochen wird wieder abgebucht.

## 4. Ausbaustufen

| Stufe | Inhalt | Ergebnis |
|---|---|---|
| **M0 Fundament** | Monorepo, Expo-App, Server-Grundgerüst, gemeinsames Paket, Tests | läuft lokal ✅ |
| **M1 Rezepte** | Datenmodell, Rezeptliste, Detailansicht, Editor inkl. Wahlkomponenten, Portionen skalieren, lokale Speicherung | App auf dem Handy nutzbar (Expo Go) ✅ |
| **M2 Haushalt & Sync** | Sync-Server als Docker-Container auf TrueNAS, Pairing per QR-Code, Gerätetokens, Zugang über Pangolin, APK-Build per GitHub Actions | beide Handys synchron, App fest installiert ✅ (umgesetzt; Inbetriebnahme siehe [BETRIEB.md](BETRIEB.md)) |
| **M3 Import & Fotos** | Foto, Screenshot, Link oder Text wird per Requesty zum Rezept; Prüfansicht; vegetarischer Vorschlag; Rezeptfotos als Dateien über den Server | Rezepte schnell erfasst ✅ (umgesetzt; siehe Abschnitt 9) |
| **M4 Planen & Einkaufen** | Lebensmittel-Katalog und Zuordnung der Zutaten (aus M3 verschoben), Plan in Wochen- und Monatsansicht (rollierend), Esser und Optionen pro Mahlzeit, Einkaufsliste erzeugen, einfacher Vorrat, Abhaken | Hauptablauf ohne REWE ✅ (umgesetzt; siehe Abschnitte 6, 7 und 12) |
| **M5 REWE** | Produktquelle, Abgleich mit Lernen, Auswahl in der App, neues Userscript mit Rückmeldung | Warenkorb wird befüllt ✅ (umgesetzt und am 6. Oktober 2026 auf rewe.de bestätigt; siehe Abschnitt 8 und [BETRIEB.md](BETRIEB.md)) |
| **M6 Vorrat & Nährwerte** | Buchungen, Mindesthaltbarkeit, Erfassungsstufen, BLS-Nährwerte pro Person, Vegetarisch-Prüfung | „intelligenter“ Vorrat ✅ (umgesetzt: Vorrat aus dem Einkauf mit Einbuchen beim Abschließen der Liste, Abbuchen nach dem Plantag und Ablauf von Frischem; Nährwerte pro Person und Portion aus BLS und Open Food Facts. Die Vegetarisch-Prüfung ist auf später verschoben, siehe Abschnitt 12) |
| **M7 Übernahme** | Bestehende Rezepte aus einem Export des alten Systems importieren | alle Rezepte im neuen System ✅ (34 Rezepte und 78 REWE-Vorlieben am 5. Oktober 2026 übernommen; Werkzeug siehe [BETRIEB.md](BETRIEB.md)) |
| **M8 Kochen & Vorschläge** | Kochmodus mit Timern; Planvorschläge aus Vorrat, Abwechslung und Aufwand | Kochen mit Timern und Vorschläge für den Plan ✅ (umgesetzt, Abschnitt 7) |
| **Später** | Angebote, Widgets, Web-Ansicht am PC, direkter Sync im WLAN, Vegetarisch-Prüfung | |

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
│  Dateien: Fotos (Name = zufällige ID)       │
│  KI-Import (Requesty), REWE-Abgleich,       │
│  Nährwerte (BLS, Open Food Facts)           │
└───────────────────▲─────────────────────────┘
                    │  HTTPS mit Gerätetoken
      Userscript auf rewe.de (PC oder Firefox Android)
```

### 5.1 Repository

```
apps/mobile      Expo-App (React Native, Expo Router)
apps/server      NAS-Dienst (Node 24, Hono)
packages/core    gemeinsame Logik: Schema, Mengen und Einheiten,
                 Einkaufslisten-Berechnung, Bewertung beim REWE-Abgleich,
                 Vorrat und Nährwerte
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
  - IDs sind zufällige Zeichenketten, keine fortlaufenden Nummern. Ausnahme: Zeilen, die sich aus anderen Daten ergeben, bekommen eine feste ID aus ihrem Schlüssel. Das gilt für Lebensmittel aus Zutatennamen (`food:zwiebel`), für Esser und Wahlen im Plan und für die Positionen der Einkaufsliste aus dem Plan. So legen zwei Geräte dieselbe Zeile an statt zwei.
  - Hauptobjekte werden nicht gelöscht, sondern mit `deletedAt` markiert. Sonst kann eine gleichzeitige Bearbeitung „halbe“ Zeilen erzeugen.
  - Vorratsmengen werden als Buchungen (+/−) gespeichert, nicht als absolute Werte.
  - Reihenfolgen laufen über Sortierschlüssel (Bruchindex), nicht über Positionsnummern.
  - Zellen enthalten keine verschachtelten Objekte. Listen bekommen eigene Tabellen.
- **Fotos** laufen nicht über den Store, sondern als Dateien: Upload und Download gehen über HTTP, im Store steht nur die ID. Die ID ist zufällig wie bei allen Einträgen, damit ein Foto auch offline sofort eine bekommt. Ein Foto ändert sich nie; ein neues Foto bekommt eine neue ID. Die App behält eigene Fotos auf dem Gerät und lädt sie hoch, sobald der Server erreichbar ist. Fotos anderer Geräte lädt sie vom Server und speichert sie zwischen.
- **Referenzdaten:** Der BLS liegt nur auf dem Server, als Datei im Image. Die App bekommt daraus nur die Werte der Lebensmittel, die der Haushalt braucht, und merkt sie sich im Store (`foodNutrition`). So rechnet sie auch offline. Die Warengruppen stehen im Code.

### 5.3 Aufgaben des Servers

1. Sync per WebSocket und Speicherung pro Haushalt.
2. Pairing und Geräte: Haushalt anlegen, Einladung per QR-Code, Gerätetokens ausstellen und widerrufen.
3. Fotos speichern und ausliefern.
4. KI-Import über Requesty.
5. REWE: Produktsuche, Abgleich, Auftrag fürs Userscript, Rückmeldung.
6. Nährwerte nachschlagen: Open Food Facts per EAN abfragen und vorhalten, Zutaten dem BLS zuordnen (mit KI).

Alle Daten liegen in einem Volume `/data`. Dafür bekommt der Server ein eigenes TrueNAS-Dataset, dessen ZFS-Snapshots als Backup dienen.

### 5.4 Zugriff und Sicherheit

- **Pangolin:** Die API bekommt eine eigene Subdomain, dort **ohne** Pangolin-Login. Dessen Anmeldeseite können weder App noch Userscript bedienen. Abgesichert wird im Dienst selbst: Jedes Gerät hat ein eigenes Token, das sich widerrufen lässt. Pangolin selbst aktuell halten.
- **Pairing:** Ein Server gehört genau einem Haushalt. Das erste Handy richtet ihn mit dem Einrichtungscode ein, den der Server beim Start in sein Protokoll schreibt. Weitere Geräte scannen einen QR-Code mit Server-URL und Einladung. Die Einladung gilt 15 Minuten und nur einmal. Für den Notfall erzeugt `cli.mjs invite` im Container einen Code.
- **Userscript:** Es bekommt ebenfalls ein Gerätetoken. Das Token wird in der App erzeugt und einmal im Script eingegeben. Im Script-Code steht kein Schlüssel.

## 6. Datenmodell (Store eines Haushalts)

Die Feldnamen sind vorläufig. Was schon umgesetzt ist, steht in `packages/core/src/schema.ts`; die Werte dort sind englisch (z. B. `vegetarian` statt `vegetarisch`).

**Personen** (`members`): Name, Ernährungsform (`vegan` | `vegetarisch` | `alles`). Später: Abneigungen. Gelatine zählt schon als Fleisch; tierisches Lab soll höchstens ein Hinweis werden (12).

**Lebensmittel** (`foods`): der zentrale Katalog, auf den alles verweist. Seit M4: Name, Warengruppe (für die Sortierung der Einkaufsliste), Ernährungsklasse (`vegan` | `vegetarisch` | `fleisch` | `fisch`) und „immer im Haus“ (siehe Vorrat). Seit M6 die Vorratseinheit (`g` | `ml` | `Stück`); sie entsteht beim ersten Einkauf. Später kommen dazu:
- Hinweise (z. B. tierisches Lab)
- REWE-Suchbegriff, REWE-Ausschlusswörter

**Zuordnung der Zutaten** (`foodAliases`): Eine Zutat zeigt nicht selbst auf ein Lebensmittel. Ihr Name wird beim Planen und Einkaufen zugeordnet:
1. eine gemerkte Zuordnung (Zeilen-ID = normalisierter Name),
2. sonst ein Lebensmittel mit gleichem Namen in Einzahl oder Mehrzahl („Zwiebeln“ = „Zwiebel“, aber „rote Zwiebel“ ≠ „Zwiebel“),
3. sonst ein neues Lebensmittel. Warengruppe und Ernährungsklasse kommen dann aus einer Schlüsselwortliste („Hähnchenbrust“ → Fleisch, „Kokosmilch“ → Konserven, vegan).

Füllwörter wie „große“ oder „frische“ und Angaben wie „zum Braten“ zählen nicht. Werden zwei Lebensmittel zusammengeführt (z. B. „Lauchzwiebeln“ und „Frühlingszwiebeln“), merkt sich der Katalog das als Zuordnung. Das gilt dann für alle Rezepte. Seit M8 geht dabei nichts verloren: Gemerkte REWE-Produkte reihen sich beim bleibenden Lebensmittel hinten an, Vorratsbuchungen und eigene Positionen der Einkaufslisten ziehen um, REWE-Produkt und Nährwerte gehen über, wenn das bleibende keine hat.

**Doppelte finden (seit M8):** Unter „Lebensmittel“ schlägt die KI auf Knopfdruck vor, welche Namen dasselbe meinen: andere Schreibweise („Tortilla-Chips“, „Tortillas Chips“, „Tortillaschips“), Einzahl und Mehrzahl, Zusätze ohne Unterschied beim Einkauf („Hähnchenbrustfilet“) und gleichbedeutende Wörter. Sorten, verarbeitete Formen und nur ähnlich Klingendes bleiben getrennt („rote Zwiebel“, „Zitronensaft“, „Tortillas“). Je Gruppe wählt der Haushalt den Namen, der bleibt, und führt zusammen oder überspringt.

Die Ernährungsklasse bestimmt, welche Option eine vegetarische Person bekommt. Fehltreffer wiegen deshalb schwer. Wörter, die nur nach Fleisch oder Fisch aussehen („Limette“ enthält „Mett“, „Fruchtfleisch“, „Weizenkleber“), stehen in einer eigenen Liste. Lernen die Schlüsselwörter dazu, bessert die App gespeicherte Lebensmittel nach (seit M6): „unbekannt“ bekommt die neue Klasse, ein solcher Fehltreffer verliert die falsche. Von Hand Gewähltes bleibt.

**Rezepte**
- `recipes`: Titel, Beschreibung, Basisportionen, Zeiten, Quelle, Foto-ID, Tags, Notizen, `deletedAt`
- `recipeIngredients`: Rezept, Sortierschlüssel, Zeilenart (`ingredient` oder `heading`; Zwischenüberschriften wie „Für das Dressing“ sind eigene Zeilen), Menge und optionale Obergrenze bei Spannen („2–3“) für die Basisportionen, Einheit, Name, Zusatz („fein gehackt“), Option (leer = für alle). Das Lebensmittel ergibt sich aus dem Namen (siehe Zuordnung oben).
- `recipeSteps`: Rezept, Sortierschlüssel, Text, Option (leer = für alle)
- `choiceGroups`: Rezept, Name („Protein“)
- `choiceOptions`: Gruppe, Name („Hähnchen“), Sortierschlüssel. Die Ernährungsklasse wird aus den Zutaten berechnet.

**Planung**
- `planEntries`: Datum (`JJJJ-MM-TT`), Mahlzeit, Rezept oder Freitext, Status (`geplant` | `eingekauft` | `gekocht`), Einkaufsliste
- `planEaters`: Planeintrag, Person (leer = Gäste), Portionen. Neue Einträge bekommen alle Personen mit je einer Portion.
- `planChoices`: Esser, Gruppe, gewählte Option. Gespeichert wird nur eine ausdrückliche Wahl; sonst gilt die automatische (6.1).

**Einkauf**
- `shoppingLists`: Name, Status (`offen` | `erledigt`, ab M5 auch `rewe`), erstellt am
- `shoppingItems`: Liste, Lebensmittel, Text, Menge, Einheit, abgehakt, Herkunft (`plan` | `vorrat` | `manuell`). Seit M5 außerdem die REWE-Packungen, falls von Hand geändert (leer = aus der Menge berechnet). Der Status im Warenkorb kommt mit dem Userscript dazu. Seit M6 bei Lebensmitteln mit Menge, was der Vorrat deckt (`stockAmount`, in der Vorratseinheit); die Menge ist dann nur der Rest zum Kaufen.
- Die Anzeige „für Lasagne (Mi 7.10.)“ wird aus den Planeinträgen der Liste berechnet; eine eigene Tabelle `shoppingItemSources` braucht es dafür nicht.

**Vorrat**
- „Immer im Haus“ (`foods.stock`, seit M4 als einfacher Vorrat): leer = nein, `have` = ja, `buy` = nachkaufen. Ohne Menge gilt `have` als da; mit Menge zählt der Bestand, und ist er leer, kommt das Lebensmittel von selbst auf die Liste.
- Seit M6 der Bestand: die Summe der Buchungen in `pantryBookings` in der Vorratseinheit des Lebensmittels (`foods.stockUnit`). Eine Buchung enthält Lebensmittel, Menge (+/−), Einheit, Grund (`purchase` | `cooked` | `correction`), Zeitpunkt und Bezug (Liste oder Planeintrag). Einkauf und Kochen haben feste IDs (`<Liste>~<Lebensmittel>`, `<Planeintrag>~<Lebensmittel>`), damit zwei Handys nichts doppelt buchen.
- Gezählt wird der Reihe nach: Ein Abgang leert höchstens, und Reste von Frischem laufen ab (Tage nach dem letzten Zugang: Obst & Gemüse 7, Brot 4, Kühlregal 14, Fleisch 3, Fisch 2; alles andere hält). Lagergemüse und -obst wie Zwiebeln, Knoblauch, Kartoffeln, Möhren, Ingwer, Kürbis, Zitronen und Äpfel zählt 28 Tage (seit M8), Frühlingszwiebeln nicht.
- Vorerst nicht: Lagerort, Mindesthaltbarkeit und „geöffnet am“. Für Verdorbenes trägt man den Bestand neu ein.

**REWE** (seit M5):
- `reweProducts`: das Produkt für den Einkauf, eine Zeile je Lebensmittel (Zeilen-ID = Lebensmittel). Sie enthält Produkt-ID, Name, Bild, Preis und Packungsangabe vom letzten Abgleich oder der letzten Wahl sowie die Listing-ID. Dazu kommt der Zustand:
  - `sure` und `unsure`: Vorschlag, passend bzw. bitte prüfen
  - `none`: nichts gefunden
  - `chosen`: ein gemerktes Produkt
  - `missing`: Keins der gemerkten Produkte war zu finden; das Produkt ist ein Vorschlag zum Prüfen.
  - `skip`: nicht bei REWE kaufen
- Seit M6 steht in `reweProducts` auch die EAN; mit ihr fragt der Server Open Food Facts nach den Nährwerten.
- `reweFavorites`: gemerkte Produkte je Lebensmittel als Rangliste (feste ID `<Lebensmittel>~<Produkt>`, Reihenfolge über Sortierschlüssel, Soft-Delete). Sie enthalten Produkt-ID, Name, Bild, Preis und Packungsangabe für die Anzeige. Wird ein Produkt vergessen, das gerade für den Einkauf gilt, zeigt die App es wieder als Vorschlag zum Prüfen.

**Nährwerte** (seit M6): `foodNutrition`, eine Zeile je Lebensmittel (Zeilen-ID = Lebensmittel), damit `foods` schlank bleibt. Sie enthält:
- Quelle (`bls` | `off` | `none` = nichts gefunden; leer = noch nicht nachgeschlagen), BLS-Code oder EAN und den Namen des Eintrags
- die EAN, mit der nachgeschlagen wurde (wechselt das REWE-Produkt, wird neu nachgeschlagen), „von Hand gewählt“ (`pinned`) und den Zeitpunkt
- das Stückgewicht in Gramm für Zutaten in Stück, Dose, Zehe, Bund usw.
- die acht Werte der Nährwerttabelle je 100 g: Energie, Fett, gesättigte Fettsäuren, Kohlenhydrate, Zucker, Ballaststoffe, Eiweiß, Salz (leer = unbekannt)

**Einstellungen** (TinyBase-Values): aktive Mahlzeiten (seit M4, je ein Schalter; Standard: nur Abendessen), seit M5 der REWE-Markt (ID, Name, Adresse) und „Bio bevorzugen“. Standardportionen braucht es nicht: Die Portionen ergeben sich aus den Personen.

**Nur auf dem Server, nicht im Store:** Haushalte, Geräte und Tokens, Einladungen, Zwischenspeicher für REWE-Produkte und Open Food Facts, der BLS, KI-Protokoll.

### 6.1 Geteilte Portionen (Wahlkomponenten)

Beispiel „Sättigender Salat“: Die Basis ist für alle gleich. Dazu kommt die Gruppe „Protein“ mit den Optionen Hähnchen (150 g pro Portion) und Halloumi (100 g pro Portion), jeweils mit eigenen Schritten.

- **Einplanen:** Die App wählt für jede Person automatisch. Eine vegetarische Person bekommt die erste vegetarische Option, alle anderen die erste Option. Die Wahl lässt sich ändern. Rezepte ohne Wahlkomponente haben einfach Portionen.
- **Einkaufsliste:** Die Basis wird mit der Summe aller Portionen multipliziert. Die Zutaten einer Option werden mit den Portionen der Personen multipliziert, die diese Option gewählt haben.
- **Kochansicht:** gemeinsame Schritte plus parallele Stränge. Dazu kommt der Hinweis, die vegetarische Komponente zuerst zu braten oder eigene Pfanne und eigenes Brett zu nehmen. Umgesetzt im Kochmodus (M8, Abschnitt 7).
- **Vegetarisch geeignet** ist ein Rezept, wenn alle Basiszutaten vegetarisch sind und jede Gruppe mindestens eine vegetarische Option hat (für die Vegetarisch-Prüfung, später).

## 7. Berechnungen in `packages/core`, mit Tests

- **Umrechnen:** von der Einheit im Rezept in die Basiseinheit des Lebensmittels, über Stückgewicht, Dichte und eine Tabelle für EL, TL, Prise usw. Ist keine Umrechnung bekannt, bleibt die Position in der Originaleinheit und wird markiert. Lieber markieren als falsch rechnen.
- **Skalieren:** Menge × (Portionen / Basisportionen), mit sinnvoller Rundung: Stück auf halbe oder ganze, Gramm auf 5 oder 10 g.
- **Einkaufsliste:** Den Bedarf je Lebensmittel summieren, dann den Vorrat abziehen. Das geht nur bei genauer Erfassung; bei grober Erfassung erscheint stattdessen der Hinweis „prüfen“. Danach kommen die Zusatzartikel dazu, und die Quellen jeder Position werden gemerkt.
  - Umgesetzt in M4: Summiert wird je Lebensmittel und Einheitengruppe. g/kg, ml/cl/dl/l, TL/EL und Stück werden umgerechnet, alles andere (Dose, Bund, Zehe …) bleibt getrennt. Bei Spannen zählt die Obergrenze. Zutaten ohne Menge („Salz“) erscheinen nur, wenn dasselbe Lebensmittel nicht schon mit Menge gebraucht wird.
  - Die Liste gleicht sich selbst mit dem Plan ab: Ändern sich Gerichte oder Portionen, passen sich die Positionen an. Abgehakte und von Hand eingetragene bleiben.
  - Einfacher Vorrat: Was „da“ ist, steht unter „Vorrat prüfen“; was „nachkaufen“ heißt, kommt von selbst auf die Liste. Abhaken setzt es wieder auf „da“.
  - Vorrat (M6): Der Bestand wird vom Bedarf abgezogen, wenn sich die Einheit umrechnen lässt (g/kg, ml/cl/dl/l, EL = 15 ml, TL = 5 ml, Gramm = Milliliter; Dose, Glas, Packung usw. = 1 Stück). Deckt er alles, steht die Position unter „Vorrat prüfen“, sonst steht nur der Rest auf der Liste. Von selbst nachgekauft wird nur, was immer im Haus sein soll.
- **Einbuchen (M6):** Beim Abschließen der Liste kommt in den Vorrat, was Rezepte brauchen oder immer im Haus sein soll (Spülmittel & Co. nicht). Die Mengen kommen aus den REWE-Packungen, sonst aus der Liste; die Seite zeigt alles vorausgewählt, ein Tipp bucht ein. Ist mindestens die Hälfte abgehakt, gilt das als Einkauf im Laden, und nur Abgehaktes ist vorausgewählt. Neue Lebensmittel bekommen die Einheit der Rezepte, wenn der Einkauf dazu passt, sonst die der Packung; bei Gramm und Milliliter zählt die der Packung.
- **Abbuchen (M6):** Ist der Tag eines eingekauften Gerichts vorbei, gilt es als gekocht und seine Zutaten gehen ab; „gekocht“ lässt sich auch selbst wählen. Gebucht wird beim Setzen, also immer nach dem Einkauf. Bei Stück wird auf ganze Stück aufgerundet (eine angebrochene Dose kommt nicht zurück). Wer den Status zurücksetzt oder den Eintrag entfernt, nimmt die Abbuchung zurück. Für Gekochtes braucht eine offene Liste nichts mehr, sonst zählte der Bedarf doppelt.
- **Nährwerte (M6):** Menge in Gramm × Wert je 100 g, im Plan für jede Person passend zu ihren Portionen und Optionen, im Rezept je Portion (mit Wahlkomponente je Option der ersten Gruppe).
  - **Gramm:** feste Gewichte für g/kg, ml/l (Gramm = Milliliter), EL = 15 g, TL = 5 g, Prise, Handvoll usw.; für Stück, Dose, Zehe, Bund usw. das Stückgewicht des Lebensmittels. Zutaten ohne Menge („Salz“) zählen nicht, bei Spannen zählt die Mitte.
  - **Lücken:** Was sich nicht umrechnen lässt oder keine Werte hat, steht als „Ohne Werte“ da. Fehlt bei einer Zutat nur ein einzelner Wert, ist die Summe eine Untergrenze und trägt ein „≥“.
  - **Quellen:** Für Lebensmittel mit REWE-Produkt fragt der Server Open Food Facts per EAN (Zwischenspeicher: gefunden 30 Tage, nicht gefunden 7 Tage). Das gilt nur mit allen Pflichtangaben der Nährwerttabelle; Ballaststoffe sind freiwillig. Sonst gilt ein BLS-Eintrag und nur ohne passenden Eintrag das lückenhafte Produkt.
  - **Zuordnung zum BLS:** Der Server sucht Kandidaten über die Namen (Kernwort hinten wie beim REWE-Abgleich, Rohes vor Zubereitetem) und lässt die KI wählen, bei Bedarf in einer zweiten Runde mit besserem Suchbegriff („Eier“ → „Hühnerei roh“). Sie schätzt auch das Stückgewicht. Ohne KI gilt nur ein sicherer Treffer.
  - **Stückgewicht:** Selbst eingetragen geht vor der REWE-Packung („1 Stück ca. 100 g“, nur wenn die Rezepte in Stück zählen), diese vor der Schätzung der KI.
  - **Ablauf:** Die App schlägt im Hintergrund nach, was Rezepte brauchen und noch keine Werte hat, in Teilen zu 15. Neu nachgeschlagen wird, wenn das REWE-Produkt wechselt oder nach zwei Wochen ohne Treffer. Ein von Hand gewählter BLS-Eintrag bleibt, bis man wieder automatisch zuordnen lässt.
- **Kochmodus (M8):** aus dem Planeintrag (Portionen und Optionen aller, die mitessen) oder aus dem Rezept (wie dort eingestellt). Erst die Zutaten, dann ein Schritt je Seite, groß geschrieben; der Bildschirm bleibt an.
  - **Schritte:** Schritte einer Option nur, wenn jemand sie bekommt, mit „Nur Halloumi · 1 Portion“. Entstehen Fleisch oder Fisch und Vegetarisches zugleich, steht vorne der Hinweis auf getrennte Pfanne und eigenes Brett.
  - **Zutaten je Schritt:** die Zutaten, die der Schritt nennt, mit Menge für die Portionen. Erkannt wird über die Namen: „Zwiebel“ = „Zwiebeln“, „Hähnchenstreifen“ = „Hähnchenbrustfilet“ (Formwörter wie Streifen, Würfel, Zehen zählen nicht), „Öl“ = „Olivenöl“. Ein Schritt einer Option nennt nur Zutaten der Basis und dieser Option.
  - **Timer:** aus Zeitangaben im Schritt („15 Minuten“, „10–15 Min.“, „eine halbe Stunde“, „1 Std. 20 Min.“); bei Spannen gilt die untere Grenze. Ohne Zahl („einige Minuten“) gibt es keinen Timer. Mehrere Timer laufen nebeneinander, auch wenn man den Kochmodus verlässt. Der Alarm ist eine geplante Benachrichtigung und klingelt deshalb auch bei gesperrtem Handy; ohne Erlaubnis vibriert nur die offene App.
  - **Zum Schluss:** Aus dem Plan lässt sich das Gericht als gekocht eintragen; die Zutaten gehen dann vom Vorrat ab.
- **Planvorschläge (M8):** Jedes Rezept bekommt für einen Tag Punkte, und jeder Vorschlag nennt bis zu drei Gründe dafür. Es gibt sie beim Hinzufügen eines Gerichts (die besten drei über der Rezeptliste) und unter „Vorschlagen“ im Plan: Man wählt, für wie viele freie Tage ab heute oder morgen. Belegte Tage (auch mit „Reste“ ohne Rezept) bleiben, wie sie sind, und zählen nicht mit. Jeder freie Tag bekommt einen Vorschlag, der sich tauschen oder weglassen lässt; ein Tipp darauf zeigt das Rezept. Erst „Einplanen“ trägt die Gerichte ein.
  - **Freier Vorrat:** Bestand plus das, was offene Einkaufslisten bringen (in ganzen REWE-Packungen), abzüglich dessen, was geplante Gerichte brauchen, das frühere zuerst. Im Entwurf behält jeder Tag seine Zutaten; die folgenden rechnen mit dem, was übrig bleibt. So zählt der Rest einer Packung („Rest vom Einkauf: Quark“), aber keine Zutat wird doppelt verplant.
  - **Punkte:** Frisches aus dem Vorrat zählt viel, kurz vor dem Ablauf noch mehr („Spinat · noch 2 Tage“). Was nach dem Einkauf übrig bleibt, zählt etwas weniger, Haltbares kaum. Grundzutaten, die in mindestens jedem fünften Rezept stecken (Zwiebeln, Butter, Zucker), zählen wenig und werden nur kurz vor dem Ablauf genannt. „Alles da“ oder „nur 1 Zutat fehlt“ gibt einen Bonus.
  - **Abwechslung:** Steht das Rezept in derselben Woche schon im Plan, rutscht es weit nach hinten. Was es in den letzten zwei Wochen gab, rutscht ein Stück nach hinten; was es lange nicht gab („zuletzt vor 6 Wochen“), rückt vor. Ähnliches bis zu zwei Tage davor oder danach (dieselbe Grundlage wie Nudeln oder Reis, dasselbe Fleisch) kostet Punkte.
  - **Passt für alle:** Isst jemand vegetarisch oder vegan mit, kommen Rezepte ohne passende Möglichkeit ganz nach hinten, mit dem Hinweis „nicht vegetarisch“ oder „nicht vegan“; Rezepte mit Optionen für beide zeigen „für beide“.
  - **Mahlzeit und Aufwand:** Wofür ein Rezept schon im Plan stand, zählt; sonst der Titel (Pancakes und Kuchen nicht zum Abendessen). Unter der Woche kostet ein Rezept über 45 Minuten ein wenig, mehr nicht.

## 8. REWE

### 8.1 Abgleich

Die Genauigkeit kommt aus dem Lebensmittel-Katalog, nicht aus einer Freitextsuche. „Tomaten (frisch)“, „Tomaten, getrocknet“ und „Tomaten, passiert“ sind verschiedene Lebensmittel, jeweils mit eigener Warengruppe, eigenem Suchbegriff und eigenen Ausschlusswörtern. Damit erledigt sich der Fall, dass für „Tomaten“ ein „Nudelgericht mit Tomatensoße“ vorgeschlagen wird.

Ablauf pro Position:
1. Hat der Haushalt Produkte für das Lebensmittel gemerkt, wird das erste davon übernommen, das im Markt verfügbar ist.
2. Sonst wird mit dem Suchbegriff des Lebensmittels gesucht. Die Kandidaten werden gefiltert: passende Kategorie, keine Ausschlusswörter, verträgliche Einheit.
3. Die übrigen Kandidaten werden bewertet nach:
   - Ähnlichkeit des Namens
   - REWE-Favorit oder schon einmal gekauft
   - Grundpreis
   - Packungsgröße passend zum Bedarf (der Rest wandert in den Vorrat)
   - Wunsch nach Bio oder regional
4. Ist das Ergebnis knapp oder unklar, wird die Position markiert. Optional prüft die KI alle unsicheren Positionen in einer gemeinsamen Anfrage.
5. Die Auswahl in der App (Alternativen oder eigene Suche) wird gemerkt, als erste Wahl oder als Ersatz.

Die Bewertungslogik liegt in `packages/core` und wird mit echten Beispielen getestet, etwa dem Tomaten-Fall.

**Umgesetzt in M5** (`packages/core/src/rewe.ts`, getestet mit echten Suchergebnissen eines REWE-Marktes):
- **Name:** Im Deutschen bestimmt der letzte Wortteil, was es ist: „Rispentomaten“ sind Tomaten, „Tomatenmark“ nicht. Wortteile für die Form zählen nicht („Lachsfilet“, „Knoblauchzehen“), getrennt Geschriebenes schon („Hähnchen Brustfilet“, „Cherry Romatomaten“). Was nach „mit“ steht, ist nur eine Zutat („Streichfett mit Butter“).
- **Warengruppe:** aus dem Kategoriepfad von REWE. Querverweise wie „Bewusste Ernährung“ zählen fast wie eine passende Gruppe; Tierbedarf und Babynahrung kommen nie infrage.
- **Preis:** für alle nötigen Packungen. Bei Bedarf ohne Menge und bei kleinem Bedarf an Vorratsdingen (Gewürze, Öl, Konserven …) zählt der Grundpreis. Viele kleine Packungen und Wörter, die nicht zum Lebensmittel gehören, kosten Punkte; auf Wunsch hat Bio Vorrang.
- **Packungen:** aus Menge und Packungsangabe; g und ml gelten als gleich, eine Dose als etwa 240 g Abtropfgewicht. EL, Zehe oder Prise brauchen eine Packung. Stück abgepackter Ware sind Packungen („2 Butter“), bei Obst, Gemüse, Fleisch und Fisch reicht eine Packung nach Gewicht.
- **Unsicher** ist ein Treffer ohne klaren Namen oder mit falscher Warengruppe. „Salz und Pfeffer“ sind zwei Lebensmittel: Gesucht wird das erste, sicher ist der Treffer nie. Passt gar kein Name, gilt die Reihenfolge der REWE-Suche.
- **Lernen:** Das Produkt gilt je Lebensmittel, die Packungen je Position. Was der Haushalt wählt oder bestätigt, merkt sich die App in einer Rangliste.
  - **Wählen:** Ein neu gewähltes Produkt wird erste Wahl oder kommt als Ersatz ans Ende. Für den Einkauf gilt sofort das erste gemerkte Produkt, das es bekanntermaßen gibt.
  - **Abgleich:** Der Server prüft bis zu fünf gemerkte Produkte der Reihe nach und nimmt das erste, das im Markt zu finden ist. Ist es nicht die erste Wahl, ist es mit „Ersatz“ markiert, braucht aber keine Prüfung.
  - **Nichts zu finden:** Gibt es keins der gemerkten Produkte, gilt der beste Vorschlag. Er ist mit „prüfen“ markiert und kommt so auch in den Warenkorb.
  - **Reihenfolge ändern:** Neue Reihenfolge und vergessene Produkte gelten ab dem nächsten Abgleich.
- **Noch nicht umgesetzt:** eigener Suchbegriff und Ausschlusswörter je Lebensmittel, die KI-Prüfung unsicherer Treffer und „schon einmal gekauft“.

### 8.2 Produktquelle

**Entscheidung:** Der Server nutzt die Produktsuche der REWE-Website. So hat es das bisherige System gemacht, und das lief stabil. Die Suche wird als austauschbarer Adapter umgesetzt. Falls REWE Anfragen vom Server künftig blockiert, ist die Rückfallebene eine Suche im Userscript direkt im Browser auf rewe.de. Die App-Schnittstelle mit extrahiertem Zertifikat (vgl. rewerse-engineering) wird nicht gebraucht.

**Technische Notizen** (inoffiziell, kann sich jederzeit ändern):
- **Produktsuche:** `GET https://www.rewe.de/shop/api/products?search=…&storeId=<Markt>&market=<Markt>&objectsPerPage=…&page=…&serviceTypes=PICKUP`
  - `storeId` und `market` werden beide gebraucht, sonst fehlen Preise und Verfügbarkeit.
  - Mit `Accept: */*` kommt eine flache Liste: `products[]` mit `productId`, `title`, `listing.currentRetailPrice` (in Cent), `listing.grammage` und `imageURL`.
  - Mit `Accept: application/json` kommt stattdessen das verschachtelte HAL-Format; das nutzt der Server. Je Produkt: `_embedded.articles[0]._embedded.listing` mit Listing-ID und `pricing` (Preis und Grundpreis in Cent, Packungsangabe wie „500g (1 kg = 3,50 €)“), `_embedded.categoryPath` und Merkmale in `attributes.tags` (`organic`, `discounted`, `regional` …).
  - Bilder sind PNGs mit 1200 × 1200 Pixeln; `?resize=120px:120px&output-format=jpg` liefert kleine JPEGs.
- **Märkte zu einer PLZ:** `GET https://www.rewe.de/shop/api/marketselection/zipcodes/<PLZ>/services/pickup` liefert eine Liste mit `wwIdent` (Markt-ID), `displayName` und `isPickupStation`.
- **Verfügbarkeit eines gemerkten Produkts:** Einen Abruf per Produkt-ID kennen wir nicht. Geprüft wird, ob die ID in den Suchergebnissen zum Produktnamen auftaucht.
- **Zurückhaltend abfragen:** Der Server speichert Suchergebnisse 6 Stunden und Märkte 7 Tage zwischen (`rewe_cache` in SQLite). Er stellt die Anfragen nacheinander, mit 400 ms Pause dazwischen. Die App schickt lange Listen in Teilen und zeigt den Fortschritt.

### 8.3 Warenkorb per Userscript (neu geschrieben)

- Holt den Auftrag (Produkt-ID, Anzahl, Name, Preis) vom Server und meldet sich dabei mit seinem Gerätetoken an.
- Legt die Produkte über die Website in den Warenkorb. Das läuft auf dem bewährten Weg aus dem bisherigen Script: Produktseite → Listing-ID → Warenkorb-Endpunkt, mit Pausen zwischen den Artikeln.
- Meldet pro Artikel zurück, ob er im Warenkorb liegt, schon drin war oder ein Fehler auftrat. Die App zeigt den Status an.
- Läuft am PC und in Firefox für Android (Violentmonkey oder Tampermonkey). Die Oberfläche funktioniert auch auf schmalen Bildschirmen.
- Optional später: nach der Abholung die Bestellung auslesen und in den Vorrat buchen.

## 9. KI-Import (M3)

- **Eingabe:** bis zu vier Fotos oder Screenshots, ein Link oder Text, auch kombiniert. Die App verkleinert Fotos vorher auf 2048 Pixel an der längeren Seite.
- **Links:** Der Server lädt die Seite und liest zuerst die schema.org-Rezeptdaten (JSON-LD), die die meisten Rezeptseiten mitliefern. Die KI bereitet sie dann auf: einheitliches Format, Übersetzung, vegetarischer Vorschlag. Ohne Requesty-Schlüssel oder wenn die KI ausfällt, übernimmt der Server die Rezeptdaten direkt. Seiten ohne Rezeptdaten gehen als Text an die KI. Instagram und Co. liefern Servern meist nur eine Anmeldeseite; dort helfen ein Screenshot oder der kopierte Text.
- **Verarbeitung:** Der Server ruft Requesty mit einem JSON-Schema auf. Das Modell steht in `IMPORT_MODEL` (Standard `anthropic/claude-sonnet-5-5`). Fällt es aus, versucht der Server `IMPORT_FALLBACK_MODEL` (Standard `google/gemini-3.6-flash`).
- **Ergebnis:** Titel, Portionen, Zeiten, Quelle, Zutatenzeilen mit Zwischenüberschrift, Schritte, Notizen und unsichere Stellen. Die Zutatenzeilen haben das Format „Menge Einheit Zutat, Zusatz“; dieselbe Logik wie im Editor zerlegt sie beim Speichern.
- **Prüfansicht in der App:** der normale Editor mit dem erkannten Entwurf. Darüber stehen die unsicheren Stellen. Das erste Foto wird zum Rezeptfoto und lässt sich ersetzen oder entfernen.
- **Fleischrezepte:** Die KI schlägt eine vegetarische Option vor. Daraus wird eine Wahlkomponente: Die erste Option ist das Original, die zweite vegetarisch, jeweils mit eigenen Zutaten und Schritten. Lässt sich eine Zutat nicht getrennt kochen (z. B. Hühnerbrühe in der Suppe), nennt die KI den Austausch als Hinweis.
- **Zuordnung der Zutaten zu Lebensmitteln:** verschoben nach M4, weil sie den Lebensmittel-Katalog braucht.
- **Noch offen:** Modellwahl mit einem Testset aus 10 Fotos aus euren Kochbüchern (2–3 Modelle vergleichen). Später möglich: Rezepte aus anderen Apps über „Teilen“ empfangen.

## 10. Technik

| Bereich | Wahl | Grund |
|---|---|---|
| App | Expo SDK 57 (React Native 0.86), Expo Router | echte Android-App in TypeScript |
| Lokale Daten und Sync | TinyBase (`MergeableStore`, `WsSynchronizer`), expo-sqlite | Sync fertig gelöst, offline, reaktive Hooks |
| Server | Node 24, Hono, TinyBase-`WsServer`, `node:sqlite` | klein, TypeScript ohne Build-Schritt |
| Tests | Vitest | für `core` und Server |
| KI | Requesty (OpenAI-kompatibel) | Modellwahl, Fallbacks, JSON-Schema |
| Nährwerte | BLS 4.0 (CC BY 4.0), Open Food Facts (ODbL) | kostenlos; BLS für Grundlebensmittel, Open Food Facts für gekaufte Produkte |
| Kochtimer | expo-notifications (geplante Benachrichtigung, exakte Alarme), expo-keep-awake | Alarm auch bei gesperrtem Handy |
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

Entschieden bei der Umsetzung von M3:
- **Fotos** bekommen eine zufällige ID statt des Inhalts-Hashs (5.2).
- **KI-Modell:** Standard ist Claude Sonnet 5.5 über Requesty, Fallback Gemini 3.6 Flash; beides per Umgebungsvariable änderbar (9).
- **Zuordnung der Zutaten** zu Lebensmitteln kommt mit dem Katalog in M4.

Entschieden bei der Umsetzung von M4:
- **App-Aufbau:** fünf Tabs (Rezepte, Plan, Einkauf, Vorrat, Haushalt), jeder mit eigenem Stack.
- **Zuordnung der Zutaten** über den Namen und gemerkte Zuordnungen, nicht über ein Feld in jeder Zutat (6). So gilt eine Korrektur für alle Rezepte, und beim Bearbeiten eines Rezepts geht nichts verloren.
- **Feste IDs für abgeleitete Zeilen** (5.2).
- **Einfacher Vorrat ohne Mengen:** „da“ oder „nachkaufen“ je Lebensmittel; Mengen und Buchungen folgen in M6.
- **Planeintrag als Kochansicht:** Er zeigt Zutaten und Schritte für die geplanten Portionen und Optionen.

Entschieden bei der Umsetzung von M5:
- **REWE-Produkt je Lebensmittel,** nicht je Position: So gilt eine Wahl auch für spätere Einkäufe. Die Packungen rechnet die App je Position aus der Menge.
- **Gemerkte Produkte als Rangliste:** Je Lebensmittel kann sich der Haushalt mehrere Produkte merken. Der Abgleich nimmt das erste, das der Markt gerade hat. Fehlen alle, gilt der beste Vorschlag zum Prüfen; das fehlende Produkt kommt nicht in den Warenkorb.
- **Abgleich auf dem Server, Auswahl in der App:** Der Server sucht und bewertet; die App sucht für die Auswahl selbst über den Server und bewertet mit derselben Logik aus `packages/core`.
- **Ein Markt für den Haushalt,** gewählt per PLZ im Haushalt oder in der Einkaufsliste.

Entschieden bei der Umsetzung von M6 (5. und 6. Oktober 2026):
- **Vorrat aus dem Einkauf statt Pflege von Hand:** Niemand soll eine lange Liste durchgehen. Gekauftes kommt beim Abschließen der Liste dazu, Gekochtes geht ab. Die erste Fassung (Menge nur für ausgewählte Lebensmittel) hat der User verworfen.
- **Gekocht nach dem Plantag:** Eingekaufte Gerichte gelten danach von selbst als gekocht; wer nicht gekocht hat, stellt „geplant“ ein.
- **Frisches läuft je Warengruppe ab,** statt eine Mindesthaltbarkeit zu erfassen.
- **Bestand als Summe von Buchungen** in der Vorratseinheit. Wechselt die Einheit, fängt der Bestand bei null an; die alten Buchungen bleiben erhalten.
- **Gramm und Milliliter gelten im Vorrat als gleich;** Prise, Zehe, Bund usw. werden nicht gebucht.
- **Nährwerte aus BLS und Open Food Facts:** BLS (lokal) für Grundlebensmittel, OFF per EAN für die REWE-Produkte des Haushalts (vom Server abgefragt und vorgehalten). Ein lokaler Komplett-Auszug von OFF ist nicht nötig.
- **BLS auf dem Server, Werte im Store:** Die App lädt nicht den ganzen BLS, sondern merkt sich die Werte ihrer Lebensmittel (`foodNutrition`). Ausgewählt wird mit dem BLS-Auszug in `apps/server/src/data/bls.json`, erzeugt mit `scripts/create-bls-data.py`.
- **Zuordnung mit KI:** Die Suche über Namen allein trifft zu oft daneben („Eier“, „Spaghetti“, „Salz und Pfeffer“). Der Server schlägt Kandidaten vor, die KI wählt. Niemand muss Lebensmittel von Hand zuordnen; wer will, wählt auf der Seite des Lebensmittels einen anderen Eintrag.
- **Lückenhafte Produktdaten:** Fehlt bei Open Food Facts eine Pflichtangabe (etwa die gesättigten Fettsäuren bei Kokosmilch), ist der BLS-Eintrag genauer als eine Summe mit Lücke.
- **Keine Vegetarisch-Prüfung vorerst:** Die automatische vegetarische Option reicht dem Haushalt. Eine Warnung im Plan (Fleisch in der Basis, keine vegetarische Option), Markierungen in der Rezeptliste und ein Hinweis auf tierisches Lab kommen erst, wenn etwas durchrutscht. Lab soll dann nur ein Hinweis sein, keine Warnung.
- **Schlüsselwörter an echten Namen geprüft:** Mit den Namen des BLS: Was dort zu Obst, Gemüse, Getreide usw. gehört, darf nicht als Fleisch oder Fisch gelten, und häufige Fleisch- und Fischnamen müssen erkannt werden (Gambas, Meeresfrüchte, Kasseler).

Entschieden bei der Umsetzung von M8 (6. Oktober 2026):
- **Timer als geplante Benachrichtigung:** Ein Küchentimer muss auch klingeln, wenn das Handy gesperrt ist oder eine andere App offen. Dafür braucht die App die Erlaubnis für Benachrichtigungen und für exakte Alarme (`USE_EXACT_ALARM`); ohne Play Store ist das kein Hindernis.
- **Bei Spannen die untere Grenze:** Bei „10–15 Minuten“ klingelt der Timer nach 10 Minuten; dann lieber einmal nachsehen.
- **Vorschläge nach Regeln statt KI:** Die Regeln laufen auf dem Handy, offline, sofort und kostenlos, und jeder Vorschlag sagt, warum. Wünsche in Worten („diese Woche was mit Kürbis“) könnte später die KI verstehen.
- **„Vorschlagen“ für eine wählbare Zahl freier Tage statt eines Wochenplans:** Wie weit der Haushalt vorausplant, ist jedes Mal anders. Gezählt werden freie Tage, damit „3 Tage“ auch drei Gerichte ergibt, wenn die nächsten Tage schon belegt sind.
- **Nichtvegetarisches nach hinten statt ausblenden;** der Aufwand spielt nur eine kleine Rolle, weil die meisten Rezepte ähnlich lange dauern.
- **Lagergemüse hält länger:** Zwiebeln, Kartoffeln & Co. liefen im Vorrat nach 7 Tagen ab und galten bei den Vorschlägen als Rest, der weg muss. Jetzt zählen sie 28 Tage.
- **Doppelte Lebensmittel: KI schlägt vor, der Haushalt entscheidet.** Die KI sieht nur die Namen und Warengruppen und fasst im Zweifel nicht zusammen. Zusammengeführt wird erst nach einem Tipp je Gruppe, weil es sich nicht rückgängig machen lässt.

Noch offen:
1. **Over-the-air-Updates:** ob und wo (EAS Update oder NAS). Das wird entschieden, wenn häufige APK-Builds lästig werden.
