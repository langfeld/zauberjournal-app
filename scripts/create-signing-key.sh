#!/usr/bin/env bash
# Erzeugt einmalig den Signaturschlüssel für die Android-App – nur mit OpenSSL, ohne Java.
#
# Wichtig: Updates lassen sich nur installieren, wenn sie mit demselben Schlüssel signiert sind.
# Schlüssel und Passwort deshalb sicher aufbewahren (z. B. im Passwortmanager) und nie ins Repo legen.
#
# Aufruf: scripts/create-signing-key.sh [Zielordner]   (Standard: ~/zauberjournal-signaturschluessel)
set -euo pipefail

target="${1:-$HOME/zauberjournal-signaturschluessel}"
if [ -e "$target/upload.p12" ]; then
  echo "In $target liegt schon ein Schlüssel – abgebrochen, damit er nicht überschrieben wird." >&2
  exit 1
fi

mkdir -p "$target"
chmod 700 "$target"
password="$(openssl rand -hex 16)"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

openssl req -x509 -newkey rsa:4096 -sha256 -days 10000 -nodes \
  -subj "/CN=Zauberjournal" \
  -keyout "$workdir/key.pem" -out "$workdir/cert.pem" 2>/dev/null
openssl pkcs12 -export -name zauberjournal \
  -inkey "$workdir/key.pem" -in "$workdir/cert.pem" \
  -out "$target/upload.p12" -passout "pass:$password"

printf '%s\n' "$password" > "$target/passwort.txt"
base64 -w0 "$target/upload.p12" > "$target/upload.p12.base64"
chmod 600 "$target"/*

cat <<EOF
Signaturschlüssel erzeugt in: $target

In GitHub unter Settings → Secrets and variables → Actions zwei Repository-Secrets anlegen:
  ANDROID_KEYSTORE_BASE64   = Inhalt von $target/upload.p12.base64
  ANDROID_KEYSTORE_PASSWORD = Inhalt von $target/passwort.txt

Danach upload.p12 und passwort.txt sicher aufbewahren; die .base64-Datei kann weg.
EOF
