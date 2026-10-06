#!/usr/bin/env python3
"""Erzeugt App-Icon, Startbildschirm, Favicon und Benachrichtigungssymbol unter apps/mobile/assets/images.

Motiv: ein aufgeschlagenes Rezeptbuch mit Funkeln, beides aus Material Symbols, auf Kräutergrün.
Aufruf im Repo-Root nach `npm install` (die Schriften kommen aus node_modules):

    python3 scripts/create-app-icons.py

Braucht Pillow (`sudo apt install python3-pil` oder `pip install pillow`).
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / 'node_modules/@expo-google-fonts'
OUT = ROOT / 'apps/mobile/assets/images'

SYMBOL_FONT = FONTS / 'material-symbols/600SemiBold/MaterialSymbols_600SemiBold.ttf'
SYMBOLS = json.loads((ROOT / 'node_modules/expo-symbols/build/android/symbols.json').read_text())
BOOK = chr(SYMBOLS['menu_book'])
SPARKLE = chr(SYMBOLS['auto_awesome'])

GREEN_TOP, GREEN_BOTTOM = '#3A7A5A', '#24533D'
CREAM = '#F7F2EA'
SAFFRON = '#F0B54D'

SIZE = 1024
# Gezeichnet wird doppelt so groß und dann verkleinert, für glatte Kanten.
SCALE = 2


def rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip('#')
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def gradient(size: int) -> Image.Image:
    top, bottom = rgb(GREEN_TOP), rgb(GREEN_BOTTOM)
    image = Image.new('RGBA', (size, size))
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t = y / (size - 1)
        draw.line([(0, y), (size, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return image


def centered(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, center: tuple[float, float], fill) -> None:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.text((center[0] - (right - left) / 2 - left, center[1] - (bottom - top) / 2 - top), text, font=font, fill=fill)


def motif(size: int, extent: float, book=CREAM, sparkle=SAFFRON) -> Image.Image:
    """Buch und Funkeln auf durchsichtigem Grund; `extent` ist der Anteil der Fläche, den das Motiv füllt.

    Das Funkeln bleibt innerhalb des Kreises, den Android bei runden Icons sicher zeigt.
    """
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    unit = size * extent
    offset = (size - unit) / 2
    font = ImageFont.truetype(str(SYMBOL_FONT), int(unit * 0.50))
    centered(draw, BOOK, font, (offset + unit * 0.45, offset + unit * 0.57), book)
    font = ImageFont.truetype(str(SYMBOL_FONT), int(unit * 0.20))
    centered(draw, SPARKLE, font, (offset + unit * 0.73, offset + unit * 0.26), sparkle)
    return image


def notification_icon(size: int) -> Image.Image:
    """Das Buch allein, weiß auf durchsichtigem Grund: Android zeigt bei Benachrichtigungen nur die Form."""
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    left, _, right, _ = draw.textbbox((0, 0), BOOK, font=ImageFont.truetype(str(SYMBOL_FONT), size))
    # Das Buch füllt 88 % der Breite.
    font = ImageFont.truetype(str(SYMBOL_FONT), int(size * size * 0.88 / (right - left)))
    centered(draw, BOOK, font, (size / 2, size / 2), (255, 255, 255))
    return image


def save(image: Image.Image, name: str, size: int = SIZE) -> None:
    image.resize((size, size), Image.LANCZOS).save(OUT / name)
    print(f'{name}: {size}×{size}')


def main() -> None:
    big = SIZE * SCALE

    # Klassisches Icon (iOS, Web, ältere Android-Versionen): Motiv über die ganze Fläche.
    icon = gradient(big)
    icon.alpha_composite(motif(big, 1.0))
    save(icon.convert('RGB'), 'icon.png')

    # Adaptives Android-Icon: Der Launcher zeigt nur die inneren 72 von 108 dp, daher ist das Motiv kleiner.
    adaptive = 72 / 108
    save(gradient(big), 'android-icon-background.png')
    save(motif(big, adaptive), 'android-icon-foreground.png')
    white = (255, 255, 255)
    save(motif(big, adaptive, book=white, sparkle=white), 'android-icon-monochrome.png')

    # Startbildschirm: das Icon als Kreis auf cremefarbenem Grund (Farbe in app.json).
    # Android 12+ schneidet das Bild rund zu; der Kreis bleibt deshalb innerhalb von 62 %.
    splash = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    mask = Image.new('L', (big, big), 0)
    inset = big * 0.19
    ImageDraw.Draw(mask).ellipse((inset, inset, big - inset, big - inset), fill=255)
    splash.paste(gradient(big), (0, 0), mask)
    splash.alpha_composite(motif(big, 0.62))
    save(splash, 'splash-icon.png')

    # Favicon für den Browser: runde Ecken.
    favicon = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    corners = Image.new('L', (big, big), 0)
    ImageDraw.Draw(corners).rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 0.24, fill=255)
    favicon.paste(icon, (0, 0), corners)
    save(favicon, 'favicon.png', 48)

    # Symbol der Benachrichtigungen (Kochtimer), eingetragen beim Plugin expo-notifications in app.json.
    save(notification_icon(big), 'notification-icon.png', 96)


if __name__ == '__main__':
    main()
