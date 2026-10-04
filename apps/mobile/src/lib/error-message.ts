/** Fehlertext für die Oberfläche. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Etwas ist schiefgelaufen. Bitte versuch es noch einmal.';
}
