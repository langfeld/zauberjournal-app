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

Ohne Schlüssel lassen sich nur Links von Rezeptseiten mit schema.org-Daten importieren, etwa von Chefkoch. Ein Import kostet je nach Modell und Zahl der Fotos etwa 1–3 Cent; die Abrechnung zeigt Requesty. Andere Modelle stellt man über `IMPORT_MODEL` und `IMPORT_FALLBACK_MODEL` ein (Modellnamen wie bei Requesty, z. B. `openai/gpt-5.4-mini`). Bei Fehlern schreibt der Server die Antwort von Requesty ins Protokoll.

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
