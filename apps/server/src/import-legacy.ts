/**
 * Übernahme aus dem alten Zauberjournal (Konzept, Stufe M7): Rezepte mit Fotos und bevorzugte
 * REWE-Produkte aus dessen JSON-Export. Das Werkzeug koppelt sich wie ein weiteres Gerät mit dem Server,
 * schreibt über den Sync und meldet sich danach wieder ab. Rezepte, deren Titel es schon gibt, bleiben
 * aus; ein zweiter Lauf übernimmt also nichts doppelt.
 *
 *   node apps/server/src/import-legacy.ts --server https://kochbuch.example.org --code ABCD-EFGH export.json …
 *   node apps/server/src/import-legacy.ts --dry-run export.json …
 *
 * Den Code zeigt die App unter „Haushalt → Gerät hinzufügen“. Fotos wandelt Python 3 mit Pillow in JPEG um.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import {
  createId,
  hasRecipeTitled,
  legacyFavoriteWrites,
  legacyIngredientNames,
  legacyRecipeDraft,
  planRecipeSave,
  readLegacyExport,
  tablesSchema,
  valuesSchema,
  type LegacyRecipe,
  type LegacyRewePreference,
  type RowWrite,
  type ShoppingTables,
  type TableName,
} from '@zauberjournal/core';
import { createMergeableStore, type MergeableStore } from 'tinybase';
import { createWsSynchronizer, type WsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { WebSocket } from 'ws';

import { SYNC_PATH } from './sync.ts';

const DEVICE_NAME = 'Übernahme aus dem alten Zauberjournal';

// ─── Fotos ───

/** Wie in der App: längere Seite höchstens 1600 Pixel, JPEG mit Qualität 80. */
const TO_JPEG = `
import io, sys
from PIL import Image
image = Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB')
image.thumbnail((1600, 1600))
output = io.BytesIO()
image.save(output, 'JPEG', quality=80, optimize=True)
sys.stdout.buffer.write(output.getvalue())
`;

function toJpeg(base64: string): Uint8Array {
  const result = spawnSync('python3', ['-c', TO_JPEG], { input: Buffer.from(base64, 'base64'), maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? result.stderr.toString().trim().split('\n').at(-1);
    throw new Error(`Ein Foto ließ sich nicht in JPEG umwandeln (braucht Python 3 mit Pillow): ${reason}`);
  }
  return new Uint8Array(result.stdout);
}

// ─── Server ───

async function call(server: string, path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const { token, headers, ...rest } = init;
  const response = await fetch(`${server}${path}`, {
    ...rest,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Der Server antwortet mit ${response.status} auf ${path}.`);
  }
  return response;
}

async function pair(server: string, code: string): Promise<{ deviceId: string; token: string }> {
  const response = await call(server, '/api/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, deviceName: DEVICE_NAME }),
  });
  return (await response.json()) as { deviceId: string; token: string };
}

/** Ein Store, der mit dem Haushalt synchronisiert; zurück kommt er, wenn eine Weile nichts mehr eintrifft. */
async function connect(server: string, token: string): Promise<{ store: MergeableStore; synchronizer: WsSynchronizer<WebSocket> }> {
  const store = createMergeableStore().setSchema(tablesSchema, valuesSchema);
  let lastChange = Date.now();
  store.addDidFinishTransactionListener(() => {
    lastChange = Date.now();
  });
  const socket = new WebSocket(`${server.replace(/^http/, 'ws')}${SYNC_PATH}`, { headers: { Authorization: `Bearer ${token}` } });
  const synchronizer = await createWsSynchronizer(store, socket);
  await synchronizer.startSync();
  const started = Date.now();
  while (Date.now() - lastChange < 1500 && Date.now() - started < 30_000) await sleep(250);
  return { store, synchronizer };
}

function tablesOf(store: MergeableStore): ShoppingTables {
  const all = store.getTables() as Partial<ShoppingTables>;
  const names = Object.keys(tablesSchema) as TableName[];
  return Object.fromEntries(names.map((name) => [name, all[name] ?? {}])) as unknown as ShoppingTables;
}

function apply(store: MergeableStore, writes: RowWrite[]) {
  store.transaction(() => {
    for (const write of writes) store.setPartialRow(write.table, write.rowId, write.cells);
  });
}

// ─── Ablauf ───

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    server: { type: 'string' },
    code: { type: 'string' },
    token: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const recipes: LegacyRecipe[] = [];
const preferences: LegacyRewePreference[] = [];
for (const file of positionals) {
  const parsed = readLegacyExport(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed) throw new Error(`${file} ist kein Export des alten Zauberjournals.`);
  if (parsed.kind === 'recipes') recipes.push(...parsed.recipes);
  else preferences.push(...parsed.preferences);
  console.log(`${file}: ${parsed.kind === 'recipes' ? `${parsed.recipes.length} Rezepte` : `${parsed.preferences.length} REWE-Produkte`}`);
}
const ingredientNames = recipes.flatMap(legacyIngredientNames);

if (positionals.length === 0 || (!values['dry-run'] && (!values.server || !(values.code || values.token)))) {
  console.log('Verwendung: node apps/server/src/import-legacy.ts --server <Adresse> --code <Code aus der App> export.json …');
  console.log('            node apps/server/src/import-legacy.ts --dry-run export.json …');
  process.exit(1);
}

if (values['dry-run']) {
  for (const recipe of recipes) {
    const draft = legacyRecipeDraft(recipe, createId);
    const photo = recipe.image ? `Foto ${Math.round(toJpeg(recipe.image.base64).length / 1024)} KB` : 'ohne Foto';
    console.log(`• ${recipe.title}: ${draft.ingredients.length} Zutatenzeilen, ${draft.steps.length} Schritte, ${photo}`);
  }
  const empty = tablesOf(createMergeableStore().setSchema(tablesSchema, valuesSchema));
  const favorites = legacyFavoriteWrites(empty, preferences, ingredientNames);
  console.log(`REWE: ${favorites.products} Produkte für ${favorites.foods} Lebensmittel`);
  process.exit(0);
}

const server = values.server!.replace(/\/+$/, '');
const paired = values.token ? null : await pair(server, values.code!);
const token = values.token ?? paired!.token;
console.log(paired ? `Als Gerät „${DEVICE_NAME}“ gekoppelt.` : 'Mit dem angegebenen Token verbunden.');

const connections: WsSynchronizer<WebSocket>[] = [];
try {
  const { store, synchronizer } = await connect(server, token);
  connections.push(synchronizer);

  const imported = new Map<string, string>();
  const skipped: string[] = [];
  for (const recipe of recipes) {
    if (hasRecipeTitled(tablesOf(store), recipe.title)) {
      skipped.push(recipe.title);
      continue;
    }
    const draft = legacyRecipeDraft(recipe, createId);
    if (recipe.image) {
      const photoId = createId();
      await call(server, `/api/photos/${photoId}`, {
        method: 'PUT',
        token,
        headers: { 'Content-Type': 'image/jpeg' },
        body: Buffer.from(toJpeg(recipe.image.base64)),
      });
      draft.photo = photoId;
    }
    const { recipeId, writes } = planRecipeSave(tablesOf(store), null, draft, recipe.createdAt ?? Date.now(), createId);
    apply(store, writes);
    imported.set(recipeId, recipe.title);
    console.log(`Rezept übernommen: ${recipe.title}`);
  }

  const favorites = legacyFavoriteWrites(tablesOf(store), preferences, ingredientNames);
  apply(store, favorites.writes);

  // Gegenprobe über eine zweite Verbindung: Ist alles auf dem Server angekommen?
  const check = await connect(server, token);
  connections.push(check.synchronizer);
  const missing = () => [...imported.keys()].filter((id) => !check.store.hasRow('recipes', id));
  for (let attempt = 0; attempt < 30 && missing().length > 0; attempt++) await sleep(500);

  console.log('');
  console.log(`Rezepte: ${imported.size} übernommen, ${skipped.length} schon da.`);
  if (skipped.length > 0) console.log(`  Schon da: ${skipped.join(', ')}`);
  console.log(`REWE: ${favorites.products} Produkte für ${favorites.foods} Lebensmittel gemerkt.`);
  if (missing().length > 0) {
    console.log(`Achtung: ${missing().length} Rezepte sind noch nicht auf dem Server angekommen. Das Werkzeug bleibt deshalb als Gerät angemeldet.`);
    process.exitCode = 1;
  } else if (paired) {
    await call(server, `/api/devices/${paired.deviceId}`, { method: 'DELETE', token });
    console.log('Alles auf dem Server angekommen; das Werkzeug hat sich wieder abgemeldet.');
  } else {
    console.log('Alles auf dem Server angekommen.');
  }
} finally {
  for (const synchronizer of connections) await synchronizer.destroy();
}
