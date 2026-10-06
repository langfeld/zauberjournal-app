/**
 * Warengruppen, Ernährungsklassen und die Schlüsselwörter, mit denen neue Lebensmittel
 * automatisch eingeordnet werden. Die Einordnung ist ein Vorschlag; im Katalog lässt sie sich ändern.
 */

export const FOOD_CATEGORY_IDS = [
  'produce',
  'bakery',
  'dairy',
  'meat',
  'fish',
  'frozen',
  'dry',
  'canned',
  'spices',
  'sweets',
  'drinks',
  'household',
  'other',
] as const;

export type FoodCategory = (typeof FOOD_CATEGORY_IDS)[number];

/** In der Reihenfolge eines typischen Wegs durch den Laden. */
export const FOOD_CATEGORIES: readonly { id: FoodCategory; label: string }[] = [
  { id: 'produce', label: 'Obst & Gemüse' },
  { id: 'bakery', label: 'Brot & Backwaren' },
  { id: 'dairy', label: 'Kühlregal' },
  { id: 'meat', label: 'Fleisch & Wurst' },
  { id: 'fish', label: 'Fisch' },
  { id: 'frozen', label: 'Tiefkühl' },
  { id: 'dry', label: 'Nudeln, Reis & Backzutaten' },
  { id: 'canned', label: 'Konserven & Gläser' },
  { id: 'spices', label: 'Gewürze, Öle & Soßen' },
  { id: 'sweets', label: 'Süßes & Aufstriche' },
  { id: 'drinks', label: 'Getränke' },
  { id: 'household', label: 'Haushalt & Drogerie' },
  { id: 'other', label: 'Sonstiges' },
];

export function categoryLabel(id: string): string {
  return FOOD_CATEGORIES.find((category) => category.id === id)?.label ?? 'Sonstiges';
}

export const FOOD_DIET_IDS = ['', 'vegan', 'vegetarian', 'meat', 'fish'] as const;

/** Ernährungsklasse eines Lebensmittels; leer = unbekannt. */
export type FoodDiet = (typeof FOOD_DIET_IDS)[number];

export const FOOD_DIETS: readonly { id: Exclude<FoodDiet, ''>; label: string }[] = [
  { id: 'vegan', label: 'vegan' },
  { id: 'vegetarian', label: 'vegetarisch' },
  { id: 'meat', label: 'Fleisch' },
  { id: 'fish', label: 'Fisch' },
];

// ─── Schlüsselwörter für Warengruppen ───
// Sie werden mit dem Ende des letzten Worts verglichen, weil im Deutschen der letzte Wortteil zählt:
// „Kokosmilch“ endet auf „kokosmilch“ (Konserven), nicht nur auf „milch“ (Kühlregal); der längste Treffer gewinnt.
// Ein „=“ davor heißt: nur das ganze Wort, z. B. „=ei“, damit „Brei“ nicht zu Eiern wird.

const CATEGORY_KEYWORDS: Record<Exclude<FoodCategory, 'other'>, readonly string[]> = {
  produce: [
    'apfel', 'äpfel', 'birne', 'banane', 'orange', 'zitrone', 'limette', 'mandarine', 'clementine', 'grapefruit',
    'traube', 'kirsche', 'beere', 'pfirsich', 'nektarine', 'aprikose', 'pflaume', 'zwetschge', 'mango', 'ananas',
    'kiwi', 'melone', 'granatapfel', 'feige', 'avocado', 'papaya', 'maracuja', 'rhabarber', 'tomate', 'gurke',
    'paprika', 'zucchini', 'aubergine', 'kartoffel', 'zwiebel', 'schalotte', 'knoblauch', 'knoblauchzehe', 'lauch',
    'porree', 'möhre', 'karotte', 'sellerie', 'fenchel', 'brokkoli', 'broccoli', 'blumenkohl', 'kohl', 'kohlrabi',
    'wirsing', 'pak choi', 'spinat', 'mangold', 'salat', 'rucola', 'rauke', 'radicchio', 'chicorée', 'chicoree',
    'endivie', 'radieschen', 'rettich', 'bete', 'kürbis', 'pilz', 'champignon', 'pfifferling', 'seitling',
    'shiitake', 'spargel', 'artischocke', 'okra', 'ingwer', 'chili', 'chilischote', 'peperoni', 'jalapeño',
    'jalapeno', 'petersilie', 'schnittlauch', 'basilikum', 'koriander', 'dill', 'minze', 'thymian', 'rosmarin',
    'salbei', 'estragon', 'kerbel', 'kräuter', 'kraut', 'pastinake', 'rübe', 'topinambur', 'kresse', 'sprossen',
    'zuckerschote', 'edamame', 'maiskolben', 'bohne', 'erbse', 'zitronengras', 'zitronensaft', 'limettensaft',
  ],
  bakery: [
    'brot', 'brötchen', 'semmel', 'baguette', 'toast', 'ciabatta', 'tortilla', 'wrap', 'pita', 'croissant',
    'brezel', 'laugenstange', 'zwieback', 'naan', 'bagel', 'brioche',
  ],
  dairy: [
    'milch', 'sahne', 'schmand', 'crème fraîche', 'creme fraiche', 'saure sahne', 'joghurt', 'jogurt', 'quark',
    'butter', 'schmalz', 'margarine', 'käse', 'mozzarella', 'burrata', 'parmesan', 'grana padano', 'pecorino', 'feta',
    'halloumi', 'ricotta', 'mascarpone', 'gouda', 'emmentaler', 'cheddar', 'gorgonzola', 'camembert', 'brie',
    'skyr', 'kefir', '=ei', 'eigelb', 'eiweiß', 'eiklar', 'tofu', 'tempeh', 'seitan', 'hefe', 'frische hefe',
    'blätterteig', 'pizzateig', 'mürbeteig', 'hefeteig', 'strudelteig', 'filoteig', 'yufkateig', 'gnocchi',
    'schupfnudel', 'tortellini', 'ravioli', 'hummus',
  ],
  meat: [
    'fleisch', 'hack', 'hähnchen', 'hühnchen', 'huhn', 'brust', 'schenkel', 'keule', 'rücken', 'pute', 'truthahn',
    'ente', 'gans', 'rind', 'kalb', 'schwein', 'lamm', 'speck', 'bacon', 'schinken', 'salami', 'wurst',
    'würstchen', 'chorizo', 'pancetta', 'guanciale', 'kassler', 'leber', 'gulasch', 'steak', 'schnitzel',
    'geschnetzeltes', 'frikadelle', 'mett', 'leberkäse', 'mortadella', 'prosciutto', 'kotelett', 'braten',
    'roulade', 'haxe',
  ],
  fish: [
    'fisch', 'lachs', 'forelle', 'kabeljau', 'seelachs', 'dorsch', 'hering', 'makrele', 'sardelle', 'anchovis',
    'sardine', 'garnele', 'shrimp', 'scampi', 'krabbe', 'muschel', 'tintenfisch', 'calamari', 'pulpo', 'oktopus',
    'zander', 'rotbarsch', 'pangasius', 'scholle', 'seezunge', 'heilbutt', 'matjes', 'kaviar', 'surimi',
  ],
  frozen: ['tiefkühl', 'tiefgekühlt', 'eiscreme', 'eis', 'pommes', 'fischstäbchen', 'kroketten', 'rahmspinat'],
  dry: [
    'mehl', 'zucker', 'backpulver', 'natron', 'stärke', 'trockenhefe', 'nudel', 'pasta', 'spaghetti', 'spaghettini',
    'linguine', 'penne', 'fusilli', 'farfalle', 'rigatoni', 'tagliatelle', 'pappardelle', 'orecchiette',
    'lasagneplatte', 'makkaroni', 'maccheroni', 'spätzle', 'reis', 'couscous', 'bulgur', 'quinoa', 'hirse',
    'polenta', 'grieß', 'flocken', 'müsli', 'cornflakes', 'linse', 'nuss', 'nüsse', 'mandel', 'cashew',
    'cashewkern', 'pistazie', 'pinienkern', 'kern', 'sesam', 'leinsamen', 'chiasamen', 'samen', 'rosine',
    'sultanine', 'dattel', 'cranberry', 'cranberries', 'kokosraspel', 'schokolade', 'kuvertüre', 'kakao',
    'paniermehl', 'semmelbrösel', 'brösel', 'panko', 'glasnudel', 'reisnudel', 'mie nudel', 'udon', 'ramen',
    'soba', 'gelatine', 'agar', 'marzipan', 'oblate', 'kakaopulver', 'puddingpulver',
  ],
  canned: [
    'dose', 'tomatenmark', 'passata', 'passierte tomaten', 'gehackte tomaten', 'stückige tomaten',
    'geschälte tomaten', 'pizzatomaten', 'getrocknete tomaten', 'kokosmilch', 'kokoscreme', 'kichererbse',
    'kidneybohne', 'weiße bohnen', 'schwarze bohnen', 'mais', 'olive', 'kaper', 'gewürzgurke', 'essiggurke',
    'cornichon', 'sauerkraut', 'artischockenherz', 'pesto', 'ajvar', 'tahin', 'tahini', 'erdnussbutter', 'fond',
    'kondensmilch', 'apfelmus', 'thunfisch',
  ],
  spices: [
    'salz', 'pfeffer', 'pulver', 'paprika edelsüß', 'paprika rosenscharf', 'curry', 'paste', 'kümmel', 'zimt',
    'muskat', 'muskatnuss', 'oregano', 'majoran', 'lorbeer', 'lorbeerblatt', 'nelke', 'kardamom', 'kurkuma',
    'chiliflocken', 'cayennepfeffer', 'garam masala', 'ras el hanout', 'zatar', 'sumach', 'piment', 'sternanis',
    'vanille', 'vanilleschote', 'vanilleextrakt', 'gewürz', 'brühe', 'bouillon', 'öl', 'essig', 'balsamico',
    'sauce', 'soße', 'sojasauce', 'tabasco', 'sriracha', 'sambal', 'harissa', 'ketchup', 'mayonnaise', 'mayo',
    'senf', 'sirup', 'agavendicksaft', 'dressing', 'miso', 'hefeflocken', 'mirin', 'tamari', 'worcestershire',
  ],
  sweets: [
    'honig', 'marmelade', 'konfitüre', 'nutella', 'aufstrich', 'keks', 'kekse', 'chips', 'gummibärchen', 'bonbon',
    'praline', 'waffel', 'cracker', 'popcorn',
  ],
  drinks: [
    'wasser', 'sprudel', 'saft', 'wein', 'bier', 'sekt', 'prosecco', 'limonade', 'cola', 'kaffee', 'espresso', 'tee',
  ],
  household: [
    'spülmittel', 'waschmittel', 'müllbeutel', 'küchenrolle', 'küchenpapier', 'toilettenpapier', 'klopapier',
    'alufolie', 'frischhaltefolie', 'backpapier', 'zahnpasta', 'shampoo', 'duschgel', 'seife', 'schwamm',
    'spültabs', 'taschentücher',
  ],
};

type Keyword = { text: string; exact: boolean; category: FoodCategory };

const KEYWORDS: readonly Keyword[] = Object.entries(CATEGORY_KEYWORDS)
  .flatMap(([category, words]) =>
    words.map((word) => ({
      text: word.replace(/^=/, ''),
      exact: word.startsWith('='),
      category: category as FoodCategory,
    })),
  )
  .sort((a, b) => b.text.length - a.text.length);

// ─── Schlüsselwörter für die Ernährungsklasse ───
// Treffer am Anfang oder Ende eines Worts: „Hähnchenbrust“, „Rinderhack“, „Räucherlachs“.

const MEAT_WORDS = [
  'fleisch', 'hack', 'hähnchen', 'hühnchen', 'huhn', 'hühner', 'pute', 'puten', 'truthahn', 'ente', 'enten', 'gans',
  'gänse', 'rind', 'kalb', 'schwein', 'lamm', 'reh', 'hirsch', 'speck', 'bacon', 'schinken', 'salami', 'wurst',
  'würstchen', 'chorizo', 'pancetta', 'guanciale', 'prosciutto', 'serrano', 'kassler', 'leber', 'gulasch', 'steak',
  'schnitzel', 'geschnetzeltes', 'frikadelle', 'mett', 'gelatine', 'mortadella', 'lyoner', 'kasseler', 'hammel',
  'beef', 'geflügel', 'gehacktes', 'eisbein', 'ochsenschwanz', 'cabanossi', 'kabanossi', 'landjäger', 'krakauer',
  'wildschwein', 'sülze', 'aspik', 'bratensoße', 'bratensauce', 'bratenfond', 'bratensaft',
];
const FISH_WORDS = [
  'fisch', 'lachs', 'forelle', 'kabeljau', 'seelachs', 'dorsch', 'hering', 'makrele', 'sardelle', 'anchovis',
  'sardine', 'garnele', 'shrimp', 'scampi', 'krabbe', 'muschel', 'tintenfisch', 'calamari', 'pulpo', 'oktopus',
  'zander', 'rotbarsch', 'pangasius', 'scholle', 'seezunge', 'heilbutt', 'matjes', 'kaviar', 'surimi', 'worcester',
  'karpfen', 'barsch', 'hecht', 'aal', 'saibling', 'seeteufel', 'wels', 'steinbutt', 'sprotte', 'bückling', 'rollmops',
  'hummer', 'languste', 'krebs', 'auster', 'gamba', 'meeresfrüchte',
];
/**
 * Wörter, die nur nach Fleisch oder Fisch aussehen, mit ihrer Warengruppe: „Limette“ enthält „Mett“,
 * „Fruchtfleisch“ ist Obst, „Weizenkleber“ hat mit Leber nichts zu tun, „Zimtrinde“ nichts mit Rind.
 */
const LOOKALIKES: Readonly<Record<string, FoodCategory>> = {
  limette: 'produce',
  fruchtfleisch: 'produce',
  hirschhornsalz: 'dry',
  kleber: 'dry',
  muschelnudel: 'dry',
  rinde: 'spices',
};
const ANIMAL_PRODUCT_WORDS = [
  'milch', 'sahne', 'rahm', 'schmand', 'crème', 'creme', 'joghurt', 'jogurt', 'quark', 'butter', 'käse',
  'mozzarella', 'burrata', 'parmesan', 'pecorino', 'padano', 'feta', 'halloumi', 'ricotta', 'mascarpone', 'gouda',
  'emmentaler', 'cheddar', 'gorgonzola', 'camembert', 'brie', 'skyr', 'kefir', 'ghee', 'honig', 'eigelb', 'eiweiß',
  'eiklar', 'eier', 'mayonnaise', 'mayo', 'pesto', 'brioche', 'croissant',
];
/** Eier sind vegetarisch, auch wenn „Hühner“ davorsteht. */
const EGG = /^(hühner|wachtel)?(ei|eier)$/;
/** Wer so beginnt, ist pflanzlich: „Kokosmilch“, „Hafersahne“, „Erdnussbutter“. */
const PLANT_PREFIXES = ['kokos', 'hafer', 'soja', 'mandel', 'reis', 'cashew', 'erbsen', 'dinkel', 'hasel', 'erdnuss', 'kakao', 'shea'];
/** Steht eins davon im Namen, ist es kein Fleisch: „Sojahack“, „Fleischtomate“, „Blumenkohlsteak“. */
const PLANT_MARKERS = [
  'vegan', 'vegetar', 'veggie', 'soja', 'tofu', 'seitan', 'tempeh', 'lupine', 'jackfruit', 'fleischtomate',
  'steaktomate', 'blumenkohl', 'sellerie', 'aubergine', 'kohlrabi', 'gemüse', 'pilz', 'champignon', 'seitling',
  'fleischersatz',
];
/** Kategorien, deren Lebensmittel ohne tierische Schlüsselwörter als vegan gelten. */
const PLANT_CATEGORIES: readonly FoodCategory[] = ['produce', 'dry', 'canned', 'spices', 'drinks'];

/** So viele Ergebnisse merkt sich `memoize` höchstens; die Namen eines Haushalts passen gut hinein. */
const MEMO_LIMIT = 5000;

/**
 * Merkt sich die Ergebnisse einer Funktion, die nur von ihrem Text abhängt. Die App ordnet nach jeder Änderung
 * alle Zutaten neu zu; ohne das rechnet sie dieselben Namen jedes Mal wieder durch.
 */
function memoize<T>(compute: (text: string) => T): (text: string) => T {
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

/** Mögliche Grundformen eines Worts: ohne Pluralendung und ohne Umlaute („Zwiebeln“ → „zwiebel“, „Äpfel“ → „apfel“). */
export const stemVariants = memoize((word: string): readonly string[] => {
  const variants = new Set([word]);
  const strip = (suffix: string) => {
    if (word.endsWith(suffix) && word.length - suffix.length >= 2) variants.add(word.slice(0, -suffix.length));
  };
  for (const suffix of ['en', 'n', 'e', 'er', 's']) strip(suffix);
  for (const variant of [...variants]) variants.add(variant.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u'));
  return [...variants];
});

function wordHas(word: string, keyword: string): boolean {
  return stemVariants(word).some((variant) => variant === keyword || variant.startsWith(keyword) || variant.endsWith(keyword));
}

/** Warengruppe eines Worts, das nur nach Fleisch oder Fisch aussieht („Limetten“); sonst `null`. */
function lookalikeCategory(word: string): FoodCategory | null {
  for (const variant of stemVariants(word)) {
    for (const [lookalike, category] of Object.entries(LOOKALIKES)) {
      if (variant.endsWith(lookalike)) return category;
    }
  }
  return null;
}

/** Ob ein normalisierter Name ein Wort enthält, das nur nach Fleisch oder Fisch aussieht. */
export function hasLookalike(normalized: string): boolean {
  return normalized.split(' ').some((word) => lookalikeCategory(word) !== null);
}

function animalProductDiet(word: string): FoodDiet | null {
  if (EGG.test(word)) return 'vegetarian';
  for (const keyword of ANIMAL_PRODUCT_WORDS) {
    if (!wordHas(word, keyword)) continue;
    const plantBased = word.endsWith(keyword) && PLANT_PREFIXES.some((prefix) => word.startsWith(prefix));
    return plantBased ? 'vegan' : 'vegetarian';
  }
  return null;
}

function categoryOf(normalized: string): FoodCategory | null {
  const words = normalized.split(' ');
  if (words[0] === 'tk' || normalized.includes('tiefkühl') || normalized.includes('tiefgekühlt')) return 'frozen';
  for (const keyword of KEYWORDS) {
    if (keyword.text.includes(' ') && normalized.includes(keyword.text)) return keyword.category;
  }
  const last = words.at(-1) ?? '';
  if (EGG.test(last)) return 'dairy';
  const lookalike = lookalikeCategory(last);
  if (lookalike) return lookalike;
  for (const variant of stemVariants(last)) {
    const match = KEYWORDS.find((keyword) =>
      keyword.exact ? variant === keyword.text : !keyword.text.includes(' ') && variant.endsWith(keyword.text),
    );
    if (match) return match.category;
  }
  return null;
}

/**
 * Ordnet einen normalisierten Lebensmittelnamen einer Warengruppe und Ernährungsklasse zu.
 * Unbekanntes landet in „Sonstiges“ mit unbekannter Ernährungsklasse.
 */
export const classifyNormalizedFood = memoize((normalized: string): Readonly<{ category: FoodCategory; diet: FoodDiet }> => {
  const words = normalized.split(' ').filter(Boolean);
  const plant = PLANT_MARKERS.some((marker) => normalized.includes(marker));
  const hits = (keywords: readonly string[]) =>
    !plant &&
    words.some((word) => !EGG.test(word) && !lookalikeCategory(word) && keywords.some((keyword) => wordHas(word, keyword)));

  let diet: FoodDiet = '';
  // Fisch vor Fleisch: „Thunfischsteak“ ist Fisch.
  if (hits(FISH_WORDS)) diet = 'fish';
  else if (hits(MEAT_WORDS)) diet = 'meat';
  else if (normalized.includes('vegan')) diet = 'vegan';
  else {
    const products = words.map(animalProductDiet).filter((value) => value !== null);
    if (products.includes('vegetarian')) diet = 'vegetarian';
    else if (products.length > 0) diet = 'vegan';
  }

  let category = categoryOf(normalized) ?? (diet === 'meat' ? 'meat' : diet === 'fish' ? 'fish' : 'other');
  // „Lachsrücken“ gehört zum Fisch, „Sojahack“ ins Kühlregal.
  if (category === 'meat' && diet === 'fish') category = 'fish';
  if (category === 'meat' && plant) category = 'dairy';
  if (diet === '' && (plant || PLANT_CATEGORIES.includes(category))) diet = 'vegan';
  // Gemerkt und damit geteilt: nicht verändern
  return Object.freeze({ category, diet });
});
