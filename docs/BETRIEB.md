# Betrieb: Server, Sync und App-Builds

Der Server hält den gemeinsamen Stand des Haushalts und verteilt Änderungen per WebSocket an alle Geräte. Die App funktioniert auch ohne Server; verbunden wird sie unter **Haushalt**.

## 1. Server auf TrueNAS

### Image

Die GitHub Action „Server-Image“ baut bei jedem Push auf `main` (sofern sich Server-Code geändert hat) das Image `ghcr.io/langfeld/zauberjournal-server:latest`.

Neue Pakete in der GitHub Container Registry sind zunächst **privat**. Damit TrueNAS das Image ohne Anmeldung laden kann, nach dem ersten Lauf auf GitHub unter *Packages → zauberjournal-server → Package settings* die Sichtbarkeit auf **Public** stellen.

### Dataset

Ein Dataset für die Daten anlegen, z. B. `POOL/apps/zauberjournal`. Der Container läuft als Benutzer mit der ID 1000, der Schreibrechte auf das Dataset braucht. Alternativ in der Compose-Datei `user: "568:568"` setzen (Benutzer „apps“ von TrueNAS) und das Dataset diesem Benutzer geben.

### App anlegen

*Apps → Discover Apps → ⋮ → Install via YAML*, Inhalt von [`deploy/compose.yaml`](../deploy/compose.yaml) einfügen und den Pfad zum Dataset anpassen.

Beim ersten Start schreibt der Server einen **Einrichtungscode** in sein Protokoll (*Apps → zauberjournal → Logs*):

```
Einrichtungscode für das erste Gerät: YGWTFY6MFS9T
```

### KI-Import

Für den Import per Foto, Text und Links ohne Rezeptdaten braucht der Server einen Schlüssel von [Requesty](https://app.requesty.ai). In der Compose-Datei bei `REQUESTY_API_KEY=` eintragen und die App neu starten. Das Protokoll zeigt dann beim Start:

```
KI-Import mit anthropic/claude-sonnet-5-5, ersatzweise google/gemini-3.6-flash
```

Ohne Schlüssel lassen sich nur Links von Rezeptseiten mit schema.org-Daten importieren, etwa von Chefkoch. Gemessen mit Claude Sonnet 5.5 kostet ein Import aus Text etwa 1,5 Cent, aus einem Foto etwa 2,5 Cent. Ein Link mit langen Schritten kostet etwa 5 Cent und dauert 10 bis 35 Sekunden. Gemini 3.6 Flash ist etwa dreimal günstiger und schneller, liest aber weniger genau. Die Abrechnung zeigt Requesty. Andere Modelle stellt man über `IMPORT_MODEL` und `IMPORT_FALLBACK_MODEL` ein (Modellnamen wie bei Requesty, z. B. `openai/gpt-5.4-mini`). Bei Fehlern schreibt der Server die Antwort von Requesty ins Protokoll.

### Nährwerte

Die App schlägt die Nährwerte der Lebensmittel aus den Rezepten im Hintergrund über den Server nach, sobald er erreichbar ist. Einrichten muss man dafür nichts:

- **Gekaufte Produkte:** Hat ein Lebensmittel ein REWE-Produkt, fragt der Server [Open Food Facts](https://world.openfoodfacts.org) nach dessen EAN. Dafür braucht er Zugang ins Internet. Die Antworten hält er in `zauberjournal.db` vor.
- **Alles andere:** Die KI wählt einen Eintrag im Bundeslebensmittelschlüssel (BLS). Sie nutzt denselben Requesty-Schlüssel und dieselben Modelle wie der Import. Im Testhaushalt brauchte der erste Durchlauf für 66 Lebensmittel 5 Anfragen und 36 Sekunden; danach kommen nur neue Lebensmittel dazu. Die Kosten zeigt Requesty.

Ohne Schlüssel nimmt der Server nur Treffer, die nach dem Namen sicher passen. Fehlende Einträge wählt man in der App unter Vorrat → Lebensmittel.

Der BLS steckt als Datei im Image (`apps/server/src/data/bls.json`). Für eine neue Version die Excel-Datei von [blsdb.de](https://blsdb.de/download) laden und im Repo `python3 scripts/create-bls-data.py <Datei>` ausführen (braucht `openpyxl`). Danach ein neues Image bauen.

### Backup

Alle Daten liegen im Dataset: `zauberjournal.db` und der Ordner `photos/` mit den Rezeptfotos. ZFS-Snapshots des Datasets sind das Backup. Zum Zurückspielen die App stoppen, den Snapshot zurückrollen und die App wieder starten.

## 2. Zugang von unterwegs über Pangolin

1. In Pangolin eine **HTTP-Ressource** anlegen, z. B. `kochbuch.<deine-domain>`. Ziel ist `http://<TrueNAS-IP>:3000` über die Newt-Site.
2. Für diese Ressource die **Pangolin-Anmeldung abschalten** (kein SSO, keine PIN, kein Passwort). App und Userscript können die Anmeldeseite nicht bedienen. Der Server prüft stattdessen bei jeder Anfrage das Token des Geräts; ohne gültiges Token gibt es keine Daten.
3. WebSockets reicht Pangolin automatisch durch.
4. Test im Browser: `https://kochbuch.<deine-domain>/api/health` sollte `{"status":"ok","name":"Zauberjournal"}` zeigen.

Pangolin selbst aktuell halten.

## 3. Geräte verbinden

- **Erstes Gerät:** App → *Haushalt* → *Einrichten*. Dort Server-Adresse (`https://kochbuch.<deine-domain>`), den Einrichtungscode aus dem Log und einen Gerätenamen eintragen. Rezepte, die schon auf dem Gerät liegen, wandern in den Haushalt.
- **Weitere Geräte:** auf einem verbundenen Gerät *Haushalt → Gerät hinzufügen*. Das zeigt einen QR-Code, der 15 Minuten gilt und nur einmal verwendbar ist. Auf dem neuen Gerät *Haushalt → Beitreten → QR-Code scannen*.
- **Gerät entfernen:** *Haushalt → Geräte → Entfernen*. Das Gerät wird sofort getrennt und behält seine Rezepte nur noch lokal.

### REWE-Userscript

Das Userscript legt die Einkaufsliste auf rewe.de in den Warenkorb, am PC oder in Firefox auf dem Handy. Es koppelt sich wie ein Gerät:

1. Im Browser Violentmonkey oder Tampermonkey installieren.
2. In der App *Haushalt → REWE-Abholung → Userscript für rewe.de* öffnen. Den Link `https://kochbuch.<deine-domain>/rewe.user.js` dort öffnen oder teilen und das Script installieren. Der Server trägt dabei seine Adresse ins Script ein.
3. Dort *Code anzeigen* tippen und den Code auf rewe.de im Userscript eingeben. Das Userscript ist der grüne Knopf unten rechts.

Zum Einkaufen in der Einkaufsliste *In den Warenkorb* tippen und dann auf rewe.de den grünen Knopf. Das Userscript meldet je Produkt zurück, ob es geklappt hat. Neue Versionen kommen mit dem Server-Image; der Userscript-Manager holt sie über denselben Link.

### Übernahme aus dem alten Zauberjournal

Rezepte (mit Fotos) und bevorzugte REWE-Produkte aus den JSON-Exporten des alten Systems überträgt ein Werkzeug im Repo. Es braucht Node 24 sowie Python 3 mit Pillow, das die Fotos in JPEG umwandelt.

1. Auf einem verbundenen Gerät *Haushalt → Gerät hinzufügen* öffnen und den Code notieren.
2. Im Repo ausführen:

   ```bash
   node apps/server/src/import-legacy.ts --server https://kochbuch.<deine-domain> --code ABCD-EFGH rezepte.json rewe-prefs.json
   ```

Das Werkzeug koppelt sich wie ein Gerät, schreibt über den Sync und meldet sich am Ende wieder ab. Rezepte, deren Titel es schon gibt, übernimmt es nicht noch einmal. Die Kategorien Frühstück, Mittagessen, Abendessen und Dessert (als Snack) werden zu „Passt zu“, die Favoriten zu Herzen. Bei schon vorhandenen Rezepten trägt das Werkzeug beides nach; Mahlzeiten nur, solange im Haushalt niemand sie selbst festgelegt hat. Mit `--update-only` trägt es nur nach und übernimmt keine Rezepte neu, auch wenn eines inzwischen umbenannt oder gelöscht ist. Die REWE-Produkte kommen je Lebensmittel in die Rangliste: das am häufigsten gewählte zuerst, hinter schon gemerkten. Mit `--dry-run` statt Server und Code zeigt es nur, was es übernehmen würde.

### Notfall: kein verbundenes Gerät mehr zur Hand

Im Container einen Einladungscode erzeugen:

```bash
docker exec zauberjournal node cli.mjs invite
```

Dann in der App *Beitreten* wählen, Server-Adresse und Code eintippen. Sind alle Geräte entfernt, gibt der Server außerdem wieder einen Einrichtungscode aus.

## 4. Android-App bauen und installieren

Die APK baut die GitHub Action „Android-APK“; lokal sind dafür keine Android-Werkzeuge nötig.

### Einmalig: Signaturschlüssel

```bash
scripts/create-signing-key.sh
```

Das Skript legt den Schlüssel in `~/zauberjournal-signaturschluessel` ab und zeigt die beiden **Repository-Secrets** an, die in GitHub unter *Settings → Secrets and variables → Actions* einzutragen sind:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`

Schlüssel und Passwort gut aufbewahren: Updates lassen sich nur installieren, wenn sie mit demselben Schlüssel signiert sind.

### Neue Version veröffentlichen

```bash
git tag v0.3.0
git push origin v0.3.0
```

Ohne Terminal geht es auf GitHub: *Releases → Draft a new release*, bei „Choose a tag“ die neue Version eintippen (z. B. `v0.3.0`), *Create new tag* wählen und veröffentlichen. Die Action baut die APK und hängt sie an das GitHub-Release an. Ein Testbuild ohne Release geht über *Actions → Android-APK → Run workflow*; die APK liegt dann als Artefakt am Lauf.

### Installieren und aktualisieren mit Obtainium

[Obtainium](https://obtainium.imranr.dev/) auf beiden Handys installieren, *App hinzufügen* wählen und die URL des GitHub-Repos eintragen. Obtainium installiert die APK aus dem neuesten Release und meldet künftige Versionen.

Beim ersten Timer im Kochmodus fragt Android, ob die App Benachrichtigungen zeigen darf. Mit Erlaubnis klingelt der Timer auch bei gesperrtem Handy; ohne vibriert er nur, solange die App offen ist. Nachträglich erlauben lässt es sich in den Android-Einstellungen unter Apps → Zauberjournal → Benachrichtigungen.

Die fertige App verbindet sich nur über **HTTPS**, also über Pangolin. Unverschlüsseltes `http://` zum NAS im Heimnetz blockiert Android in fertigen Apps.

## 5. Entwicklung

```bash
npm run dev:server   # Server lokal auf Port 3000, Daten in apps/server/data
npm run dev:app      # Expo; im Browser mit „w“, auf dem Handy mit Expo Go
```

Lokal lautet die Server-Adresse in der App `http://<IP-des-Rechners>:3000`; Expo Go erlaubt unverschlüsseltes HTTP. Im Browser geht das Token zum Entwickeln als URL-Parameter mit, weil Browser bei WebSockets keine Header erlauben. Die App auf dem Handy schickt es als Header.

Für den KI-Import beim Entwickeln eine Datei `apps/server/.env` anlegen (Git ignoriert sie):

```
REQUESTY_API_KEY=…
```

`npm run dev:server` liest sie beim Start.
