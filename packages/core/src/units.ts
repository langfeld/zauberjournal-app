/**
 * Einheiten in Rezepten.
 *
 * `rounding` legt fest, wie skalierte Mengen gerundet und angezeigt werden:
 * - `fine`: Gramm/Milliliter – ganze Zahlen, bei größeren Mengen auf 5 bzw. 10
 * - `decimal`: kg, Liter usw. – zwei Nachkommastellen
 * - `fraction`: Löffel, Stück, Bund … – Viertel, Halbe, ganze Zahlen; Anzeige mit ½, ¼, ¾
 */
export type UnitRounding = 'fine' | 'decimal' | 'fraction';

export type UnitDefinition = {
  /** Kanonische Schreibweise, so wird die Einheit gespeichert. */
  id: string;
  singular: string;
  plural: string;
  /** Schreibweisen beim Erkennen, klein geschrieben. */
  aliases: readonly string[];
  rounding: UnitRounding;
};

export const UNITS: readonly UnitDefinition[] = [
  { id: 'g', singular: 'g', plural: 'g', aliases: ['g', 'gr', 'gr.', 'gramm'], rounding: 'fine' },
  { id: 'kg', singular: 'kg', plural: 'kg', aliases: ['kg', 'kilo', 'kilogramm'], rounding: 'decimal' },
  { id: 'ml', singular: 'ml', plural: 'ml', aliases: ['ml', 'milliliter'], rounding: 'fine' },
  { id: 'cl', singular: 'cl', plural: 'cl', aliases: ['cl', 'zentiliter'], rounding: 'decimal' },
  { id: 'dl', singular: 'dl', plural: 'dl', aliases: ['dl', 'deziliter'], rounding: 'decimal' },
  { id: 'l', singular: 'l', plural: 'l', aliases: ['l', 'liter', 'ltr', 'ltr.'], rounding: 'decimal' },
  { id: 'EL', singular: 'EL', plural: 'EL', aliases: ['el', 'el.', 'essl.', 'esslöffel', 'eßlöffel'], rounding: 'fraction' },
  { id: 'TL', singular: 'TL', plural: 'TL', aliases: ['tl', 'tl.', 'teel.', 'teelöffel'], rounding: 'fraction' },
  { id: 'Msp.', singular: 'Msp.', plural: 'Msp.', aliases: ['msp', 'msp.', 'messerspitze', 'messerspitzen'], rounding: 'fraction' },
  { id: 'Prise', singular: 'Prise', plural: 'Prisen', aliases: ['prise', 'prisen'], rounding: 'fraction' },
  { id: 'Bund', singular: 'Bund', plural: 'Bund', aliases: ['bund', 'bd', 'bd.'], rounding: 'fraction' },
  { id: 'Zehe', singular: 'Zehe', plural: 'Zehen', aliases: ['zehe', 'zehen'], rounding: 'fraction' },
  { id: 'Stück', singular: 'Stück', plural: 'Stück', aliases: ['stück', 'stk', 'stk.', 'st.'], rounding: 'fraction' },
  { id: 'Dose', singular: 'Dose', plural: 'Dosen', aliases: ['dose', 'dosen'], rounding: 'fraction' },
  {
    id: 'Pck.',
    singular: 'Pck.',
    plural: 'Pck.',
    aliases: ['pck', 'pck.', 'pkg', 'pkg.', 'packung', 'packungen', 'päckchen'],
    rounding: 'fraction',
  },
  { id: 'Becher', singular: 'Becher', plural: 'Becher', aliases: ['becher'], rounding: 'fraction' },
  { id: 'Tasse', singular: 'Tasse', plural: 'Tassen', aliases: ['tasse', 'tassen'], rounding: 'fraction' },
  { id: 'Glas', singular: 'Glas', plural: 'Gläser', aliases: ['glas', 'gläser'], rounding: 'fraction' },
  { id: 'Scheibe', singular: 'Scheibe', plural: 'Scheiben', aliases: ['scheibe', 'scheiben'], rounding: 'fraction' },
  { id: 'Zweig', singular: 'Zweig', plural: 'Zweige', aliases: ['zweig', 'zweige'], rounding: 'fraction' },
  { id: 'Blatt', singular: 'Blatt', plural: 'Blätter', aliases: ['blatt', 'blätter'], rounding: 'fraction' },
  { id: 'Handvoll', singular: 'Handvoll', plural: 'Handvoll', aliases: ['handvoll'], rounding: 'fraction' },
  { id: 'Tropfen', singular: 'Tropfen', plural: 'Tropfen', aliases: ['tropfen'], rounding: 'fraction' },
  { id: 'Spritzer', singular: 'Spritzer', plural: 'Spritzer', aliases: ['spritzer'], rounding: 'fraction' },
  { id: 'Schuss', singular: 'Schuss', plural: 'Schuss', aliases: ['schuss', 'schuß'], rounding: 'fraction' },
  { id: 'Würfel', singular: 'Würfel', plural: 'Würfel', aliases: ['würfel'], rounding: 'fraction' },
  { id: 'Kopf', singular: 'Kopf', plural: 'Köpfe', aliases: ['kopf', 'köpfe'], rounding: 'fraction' },
  { id: 'Stange', singular: 'Stange', plural: 'Stangen', aliases: ['stange', 'stangen'], rounding: 'fraction' },
  { id: 'Knolle', singular: 'Knolle', plural: 'Knollen', aliases: ['knolle', 'knollen'], rounding: 'fraction' },
  { id: 'Beutel', singular: 'Beutel', plural: 'Beutel', aliases: ['beutel', 'btl', 'btl.'], rounding: 'fraction' },
  { id: 'Flasche', singular: 'Flasche', plural: 'Flaschen', aliases: ['flasche', 'flaschen'], rounding: 'fraction' },
];

const UNITS_BY_ALIAS = new Map(UNITS.flatMap((unit) => unit.aliases.map((alias) => [alias, unit] as const)));
const UNITS_BY_ID = new Map(UNITS.map((unit) => [unit.id, unit] as const));

/** Erkennt eine Einheit anhand einer Schreibweise, z. B. „Esslöffel“ → EL. */
export function findUnit(token: string): UnitDefinition | undefined {
  return UNITS_BY_ALIAS.get(token.toLocaleLowerCase('de'));
}

/** Rundungsart einer gespeicherten Einheit; unbekannte Einheiten werden wie Stück behandelt. */
export function unitRounding(unitId: string): UnitRounding {
  return UNITS_BY_ID.get(unitId)?.rounding ?? 'fraction';
}

/** Anzeigename einer gespeicherten Einheit in Einzahl oder Mehrzahl. */
export function unitLabel(unitId: string, plural: boolean): string {
  const unit = UNITS_BY_ID.get(unitId);
  if (!unit) return unitId;
  return plural ? unit.plural : unit.singular;
}
