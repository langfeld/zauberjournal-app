/** Warmes Papier, Kräutergrün und Terrakotta. */
export const colors = {
  background: '#F7F2EA',
  surface: '#FFFCF7',
  /** Vertiefte Flächen, z. B. hinter Umschaltern oder in Karten. */
  surfaceSunken: '#F0E8DC',
  border: '#E8DED0',
  borderStrong: '#D8CAB7',
  /** Feiner Rand um Karten, zusätzlich zum Schatten. */
  hairline: 'rgba(116, 92, 66, 0.10)',
  text: '#2A231D',
  textMuted: '#74685B',
  primary: '#2F6B4F',
  primaryText: '#FFFFFF',
  primarySoft: '#E2EDE4',
  accent: '#B9573A',
  accentSoft: '#F6E3D9',
  danger: '#B3261E',
  dangerSoft: '#FAE6E3',
  warning: '#9A5D00',
  warningSoft: '#FBEFD9',
  /** Notizzettel */
  paper: '#FBF3DE',
  paperBorder: '#F0E2BE',
} as const;

/** Schriften, die das Root-Layout beim Start lädt. */
export const fonts = {
  /** Überschriften und Titel; nie mit `fontWeight` kombinieren, sonst fettet Android künstlich nach. */
  display: 'Fraunces_600SemiBold',
  /** Beschreibungen und Notizen. */
  displayItalic: 'Fraunces_400Regular_Italic',
  icons: 'MaterialSymbols_400Regular',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

export const shadows = {
  card: '0px 1px 2px rgba(74, 52, 30, 0.06), 0px 4px 14px rgba(74, 52, 30, 0.07)',
  raised: '0px 2px 6px rgba(74, 52, 30, 0.10), 0px 10px 24px rgba(74, 52, 30, 0.10)',
  button: '0px 2px 8px rgba(47, 107, 79, 0.28)',
} as const;

/** Ein sanftes Farbpaar: heller Hintergrund, kräftige Schrift. */
export type Tone = { background: string; foreground: string };

export const tones = {
  green: { background: '#E3EFDF', foreground: '#3D7535' },
  wheat: { background: '#F5E8D3', foreground: '#8F5E1C' },
  blue: { background: '#E5E8F7', foreground: '#4D5A9E' },
  rose: { background: '#F6E0DE', foreground: '#A3413A' },
  teal: { background: '#DCEFEC', foreground: '#2C7671' },
  ice: { background: '#DDF0F5', foreground: '#22758A' },
  terracotta: { background: '#F6E3D9', foreground: '#A9532F' },
  ochre: { background: '#F4EACF', foreground: '#86650F' },
  olive: { background: '#EBEBD6', foreground: '#626320' },
  berry: { background: '#F4E0EA', foreground: '#954069' },
  sky: { background: '#E1ECF4', foreground: '#356A92' },
  lavender: { background: '#EAE4F3', foreground: '#66508E' },
  stone: { background: '#ECE7DF', foreground: '#6B6156' },
} as const satisfies Record<string, Tone>;

/** Farben für Platzhalter und Personen, ausgewählt über den Namen. */
const NAME_TONES: readonly Tone[] = [
  tones.green,
  tones.terracotta,
  tones.ochre,
  tones.teal,
  tones.berry,
  tones.lavender,
  tones.wheat,
  tones.blue,
];

/** Immer dieselbe Farbe für denselben Namen. */
export function toneFor(name: string): Tone {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return NAME_TONES[Math.abs(hash) % NAME_TONES.length]!;
}

/** Erster Buchstabe für Platzhalter, z. B. „H“ für „Hähnchen-Curry“. */
export function initialOf(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase('de') || '?';
}
