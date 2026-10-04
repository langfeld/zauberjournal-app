/**
 * Notfall-Werkzeug, falls kein angemeldetes Gerät mehr zur Hand ist:
 *   node src/cli.ts invite   → erzeugt einen Einladungscode für ein neues Gerät
 * Im Container: docker exec zauberjournal node apps/server/src/cli.ts invite
 */
import { join, resolve } from 'node:path';

import { openDatabase } from './database.ts';
import { createHousehold } from './household.ts';

const [command] = process.argv.slice(2);

if (command === 'invite') {
  const db = openDatabase(join(resolve(process.env.DATA_DIR ?? 'data'), 'zauberjournal.db'));
  const { code, expiresAt } = createHousehold(db).createInvite(null);
  console.log(`Einladungscode: ${code} (gültig bis ${new Date(expiresAt).toLocaleTimeString('de-DE')})`);
  db.close();
} else {
  console.log('Verwendung: node src/cli.ts invite');
  process.exitCode = 1;
}
