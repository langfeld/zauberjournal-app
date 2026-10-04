const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  iuml: 'ï',
  ntilde: 'ñ',
  oslash: 'ø',
  deg: '°',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  times: '×',
  middot: '·',
  euro: '€',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  lsquo: '‘',
  rsquo: '’',
};

/** Ersetzt HTML-Entitäten wie `&amp;`, `&auml;` oder `&#8211;`. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

const INLINE_TAG = /<\/?(?:a|abbr|b|em|i|mark|small|span|strong|sub|sup|u)\b[^>]*>/gi;

/** Text ohne Tags und Entitäten, Leerraum zusammengefasst. Inline-Tags wie `<em>` fallen ersatzlos weg. */
export function plainText(html: string): string {
  return decodeEntities(html.replace(INLINE_TAG, '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lesbarer Text einer HTML-Seite: ohne Skripte und Styles, Blöcke als eigene Zeilen. */
export function htmlToText(html: string): string {
  const withoutCode = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  const lines = withoutCode.replace(/<\/?(br|p|div|li|ul|ol|h[1-6]|tr|section|article|header|footer)\b[^>]*>/gi, '\n');
  return decodeEntities(lines.replace(/<[^>]*>/g, ' '))
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n[\s]*/g, '\n')
    .trim();
}
