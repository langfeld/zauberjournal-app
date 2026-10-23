/**
 * Texte klein schreiben und sortieren, ohne die Locale-Funktionen von JavaScript. Hermes gibt auf Android jedes
 * `localeCompare`, `toLocaleLowerCase` und `toLocaleUpperCase` über JNI an Java weiter und sucht dort die Locale
 * unter allen verfügbaren; `localeCompare` legt dazu jedes Mal einen Collator an. Ein paar tausend Aufrufe halten
 * die App so sekundenlang auf (https://github.com/facebook/hermes/issues/867). Für Deutsch schreiben `toLowerCase`
 * und `toUpperCase` genauso klein und groß.
 */

/** So viele Ergebnisse merkt sich `memoize` höchstens; die Namen eines Haushalts passen gut hinein. */
const MEMO_LIMIT = 5000;

/**
 * Merkt sich die Ergebnisse einer Funktion, die nur von ihrem Text abhängt. Die App ordnet nach jeder Änderung
 * alle Zutaten neu zu; ohne das rechnet sie dieselben Namen jedes Mal wieder durch.
 */
export function memoize<T>(compute: (text: string) => T): (text: string) => T {
  const results = new Map<string, T>();
  return (text) => {
    let result = results.get(text);
    if (result === undefined) {
      if (results.size >= MEMO_LIMIT) results.clear();
      result = compute(text);
      results.set(text, result);
    }
    return result;
  };
}

/** Umlaute und Buchstaben mit Akzent zählen beim Sortieren wie ihr Grundbuchstabe, ß wie ss. */
const BASE_LETTERS: Readonly<Record<string, string>> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a', æ: 'ae', ç: 'c', è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i', ñ: 'n', ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o', ø: 'o', œ: 'oe',
  ù: 'u', ú: 'u', û: 'u', ü: 'u', ý: 'y', ÿ: 'y', ß: 'ss',
};

const sortForm = memoize((text: string) => text.toLowerCase().replace(/[^\x00-\x7f]/g, (char) => BASE_LETTERS[char] ?? char));

/**
 * Alphabetisch wie im Wörterbuch, also wie `localeCompare(…, 'de', { sensitivity: 'base' })`: Groß und klein
 * sowie „Ä“ und „A“ gelten als gleich, und Gleiches behält beim Sortieren seine Reihenfolge.
 */
export function compareText(a: string, b: string): number {
  const formA = sortForm(a);
  const formB = sortForm(b);
  if (formA < formB) return -1;
  return formA > formB ? 1 : 0;
}
