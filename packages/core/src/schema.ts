import type { TablesSchema } from 'tinybase';

const optionalNumber = { type: 'number', allowNull: true, default: null } as const;

/**
 * Tabellen des Haushalts-Stores (TinyBase).
 *
 * Regeln für den Sync: zufällige IDs, Soft-Delete über `deletedAt`, Reihenfolge über `sortKey`,
 * keine verschachtelten Objekte in Zellen. Leere optionale Zahlen sind `null`.
 * Mengen in Zutaten beziehen sich immer auf die Basisportionen des Rezepts.
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
} as const satisfies TablesSchema;

export type AppTablesSchema = typeof tablesSchema;
