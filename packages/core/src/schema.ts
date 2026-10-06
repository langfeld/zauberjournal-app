import type { TablesSchema, ValuesSchema } from 'tinybase';

import { FOOD_CATEGORY_IDS, FOOD_DIET_IDS } from './food-catalog.ts';
import { STOCK_UNITS } from './foods.ts';
import { MEAL_IDS } from './meals.ts';
import { NUTRITION_SOURCES } from './nutrition.ts';
import { PANTRY_REASONS } from './pantry.ts';
import { RECIPE_MEALS_BY } from './recipe-meals.ts';
import { REWE_STATES } from './rewe.ts';

const optionalNumber = { type: 'number', allowNull: true, default: null } as const;

/**
 * Tabellen des Haushalts-Stores (TinyBase).
 *
 * Regeln für den Sync: zufällige IDs, Soft-Delete über `deletedAt`, Reihenfolge über `sortKey`,
 * keine verschachtelten Objekte in Zellen. Leere optionale Zahlen sind `null`.
 * Mengen in Zutaten beziehen sich immer auf die Basisportionen des Rezepts.
 *
 * Ausnahme bei den IDs: Zeilen, die sich aus anderen Daten ergeben, haben eine feste ID aus ihrem Schlüssel
 * (Lebensmittel aus Zutatennamen, Esser und Wahlen im Plan, Positionen der Einkaufsliste aus dem Plan,
 * REWE-Produkte je Lebensmittel).
 * So entsteht auf zwei Geräten dieselbe Zeile statt eines Duplikats.
 */
export const tablesSchema = {
  recipes: {
    title: { type: 'string', default: '' },
    description: { type: 'string', default: '' },
    servings: { type: 'number', default: 2 },
    prepMinutes: optionalNumber,
    cookMinutes: optionalNumber,
    source: { type: 'string', default: '' },
    notes: { type: 'string', default: '' },
    /** ID des Rezeptfotos; die Datei liegt auf dem Server. Leer = kein Foto. */
    photo: { type: 'string', default: '' },
    /** Wozu das Rezept passt (seit M8), wie die Mahlzeiten des Plans; keine = kein eigenes Gericht. */
    mealBreakfast: { type: 'boolean', default: false },
    mealLunch: { type: 'boolean', default: false },
    mealDinner: { type: 'boolean', default: false },
    mealSnack: { type: 'boolean', default: false },
    /** Wer die Mahlzeiten festgelegt hat: leer = noch niemand (dann ordnet die KI zu), `ai` = die KI, `person` = jemand im Haushalt. */
    mealsBy: { enum: RECIPE_MEALS_BY, default: '' },
    /** Vor diesem Tag (`JJJJ-MM-TT`) nicht vorschlagen; leer = keine Pause. */
    pausedUntil: { type: 'string', default: '' },
    createdAt: { type: 'number', default: 0 },
    updatedAt: { type: 'number', default: 0 },
    deletedAt: optionalNumber,
  },
  recipeIngredients: {
    recipeId: { type: 'string', default: '' },
    /** Leer = Zutat für alle; sonst gehört sie zu einer Option einer Wahlkomponente. */
    optionId: { type: 'string', default: '' },
    sortKey: { type: 'string', default: '' },
    kind: { enum: ['ingredient', 'heading'], default: 'ingredient' },
    amount: optionalNumber,
    amountMax: optionalNumber,
    unit: { type: 'string', default: '' },
    name: { type: 'string', default: '' },
    note: { type: 'string', default: '' },
    deletedAt: optionalNumber,
  },
  recipeSteps: {
    recipeId: { type: 'string', default: '' },
    /** Leer = Schritt für alle; sonst nur für diese Option. */
    optionId: { type: 'string', default: '' },
    sortKey: { type: 'string', default: '' },
    text: { type: 'string', default: '' },
    deletedAt: optionalNumber,
  },
  choiceGroups: {
    recipeId: { type: 'string', default: '' },
    sortKey: { type: 'string', default: '' },
    name: { type: 'string', default: '' },
    deletedAt: optionalNumber,
  },
  choiceOptions: {
    recipeId: { type: 'string', default: '' },
    groupId: { type: 'string', default: '' },
    sortKey: { type: 'string', default: '' },
    name: { type: 'string', default: '' },
    deletedAt: optionalNumber,
  },
  members: {
    name: { type: 'string', default: '' },
    diet: { enum: ['omnivore', 'vegetarian', 'vegan'], default: 'omnivore' },
    sortKey: { type: 'string', default: '' },
    deletedAt: optionalNumber,
  },
  /** Lebensmittel-Katalog; automatisch angelegte Einträge haben die ID `food:<Suchschlüssel>`. */
  foods: {
    name: { type: 'string', default: '' },
    category: { enum: FOOD_CATEGORY_IDS, default: 'other' },
    diet: { enum: FOOD_DIET_IDS, default: '' },
    /** Einfacher Vorrat: leer = nicht geführt, `have` = da, `buy` = nachkaufen. */
    stock: { enum: ['', 'have', 'buy'], default: '' },
    /** Genauer Vorrat (seit M6): Einheit des Bestands, der Bestand selbst steht in `pantryBookings`; leer = nicht genau. */
    stockUnit: { enum: ['', ...STOCK_UNITS], default: '' },
    deletedAt: optionalNumber,
  },
  /** Gemerkte Zuordnung eines Zutatennamens; die Zeilen-ID ist der normalisierte Name. */
  foodAliases: {
    foodId: { type: 'string', default: '' },
  },
  planEntries: {
    /** Tag als `JJJJ-MM-TT`. */
    date: { type: 'string', default: '' },
    meal: { enum: MEAL_IDS, default: 'dinner' },
    /** Leer = Eintrag ohne Rezept, dann steht der Text in `text`. */
    recipeId: { type: 'string', default: '' },
    text: { type: 'string', default: '' },
    status: { enum: ['planned', 'shopped', 'cooked'], default: 'planned' },
    shoppingListId: { type: 'string', default: '' },
    createdAt: { type: 'number', default: 0 },
    deletedAt: optionalNumber,
  },
  /** Wer isst mit; ID `<Eintrag>/<Person>`, Gäste `<Eintrag>/guests`. */
  planEaters: {
    entryId: { type: 'string', default: '' },
    /** Leer = Gäste. */
    memberId: { type: 'string', default: '' },
    servings: { type: 'number', default: 1 },
    deletedAt: optionalNumber,
  },
  /** Gewählte Option je Esser und Wahlkomponente; ID `<Esser>/<Wahlkomponente>`. */
  planChoices: {
    eaterId: { type: 'string', default: '' },
    groupId: { type: 'string', default: '' },
    optionId: { type: 'string', default: '' },
  },
  shoppingLists: {
    name: { type: 'string', default: '' },
    status: { enum: ['open', 'done'], default: 'open' },
    createdAt: { type: 'number', default: 0 },
    deletedAt: optionalNumber,
  },
  /** Positionen aus dem Plan und dem Vorrat haben die ID `<Liste>~<Lebensmittel>~<Einheitengruppe>`. */
  shoppingItems: {
    listId: { type: 'string', default: '' },
    foodId: { type: 'string', default: '' },
    name: { type: 'string', default: '' },
    amount: optionalNumber,
    unit: { type: 'string', default: '' },
    checked: { type: 'boolean', default: false },
    origin: { enum: ['plan', 'pantry', 'manual'], default: 'manual' },
    /** Packungen bei REWE, wenn von Hand geändert; leer = aus der Menge berechnet. */
    rewePacks: optionalNumber,
    /**
     * Genau geführte Lebensmittel: was der Vorrat abdeckt, in dessen Einheit; `amount` ist dann nur der Rest
     * zum Kaufen (0 = alles da). Leer = kein Abzug.
     */
    stockAmount: optionalNumber,
    createdAt: { type: 'number', default: 0 },
    deletedAt: optionalNumber,
  },
  /**
   * REWE-Produkt je Lebensmittel für den Einkauf; die Zeilen-ID ist die ID des Lebensmittels. Ergebnis des
   * letzten Abgleichs oder der letzten Wahl (Zustände siehe `ReweState`). Preis und Packung: Stand des letzten Abgleichs.
   */
  reweProducts: {
    state: { enum: REWE_STATES, default: 'none' },
    productId: { type: 'string', default: '' },
    name: { type: 'string', default: '' },
    imageUrl: { type: 'string', default: '' },
    price: { type: 'number', default: 0 },
    grammage: { type: 'string', default: '' },
    listingId: { type: 'string', default: '' },
    /** EAN des Produkts (seit M6), für die Nährwerte von Open Food Facts; leer = unbekannt. */
    ean: { type: 'string', default: '' },
    updatedAt: { type: 'number', default: 0 },
  },
  /**
   * Vorratsbuchungen genau geführter Lebensmittel (seit M6): Zugang positiv, Abgang negativ. Der Bestand ist
   * die Summe der Buchungen in der aktuellen Vorratseinheit des Lebensmittels.
   */
  pantryBookings: {
    foodId: { type: 'string', default: '' },
    amount: { type: 'number', default: 0 },
    unit: { enum: STOCK_UNITS, default: 'g' },
    reason: { enum: PANTRY_REASONS, default: 'correction' },
    /** Einkaufsliste bzw. Planeintrag, auf den sich die Buchung bezieht; leer = keiner. */
    listId: { type: 'string', default: '' },
    entryId: { type: 'string', default: '' },
    createdAt: { type: 'number', default: 0 },
    deletedAt: optionalNumber,
  },
  /**
   * Nährwerte je Lebensmittel (seit M6), Zeilen-ID = Lebensmittel: Werte je 100 g aus dem BLS oder für das
   * REWE-Produkt aus Open Food Facts, dazu das Stückgewicht für Zutaten in Stück.
   */
  foodNutrition: {
    source: { enum: NUTRITION_SOURCES, default: '' },
    code: { type: 'string', default: '' },
    label: { type: 'string', default: '' },
    ean: { type: 'string', default: '' },
    pinned: { type: 'boolean', default: false },
    checkedAt: { type: 'number', default: 0 },
    gramsPerPiece: optionalNumber,
    kcal: optionalNumber,
    fat: optionalNumber,
    saturatedFat: optionalNumber,
    carbs: optionalNumber,
    sugar: optionalNumber,
    fiber: optionalNumber,
    protein: optionalNumber,
    salt: optionalNumber,
  },
  /**
   * Gemerkte REWE-Produkte je Lebensmittel, ID `<Lebensmittel>~<Produkt>`. Beim Abgleich gilt das erste,
   * das der Markt gerade hat. Name, Bild, Preis und Packung: Stand der letzten Suche.
   */
  reweFavorites: {
    foodId: { type: 'string', default: '' },
    productId: { type: 'string', default: '' },
    sortKey: { type: 'string', default: '' },
    name: { type: 'string', default: '' },
    imageUrl: { type: 'string', default: '' },
    price: { type: 'number', default: 0 },
    grammage: { type: 'string', default: '' },
    deletedAt: optionalNumber,
  },
} as const satisfies TablesSchema;

/** Einstellungen des Haushalts. */
export const valuesSchema = {
  /** Welche Mahlzeiten der Plan zeigt (Standard: nur Abendessen). */
  mealBreakfast: { type: 'boolean', default: false },
  mealLunch: { type: 'boolean', default: false },
  mealDinner: { type: 'boolean', default: true },
  mealSnack: { type: 'boolean', default: false },
  /** REWE-Markt für Abgleich und Abholung; leer = keiner gewählt. */
  reweMarketId: { type: 'string', default: '' },
  reweMarketName: { type: 'string', default: '' },
  reweMarketAddress: { type: 'string', default: '' },
  /** Beim Abgleich Bio-Produkte vorziehen. */
  reweOrganic: { type: 'boolean', default: false },
} as const satisfies ValuesSchema;

export type AppTablesSchema = typeof tablesSchema;
export type AppValuesSchema = typeof valuesSchema;
export type TableName = keyof AppTablesSchema;
