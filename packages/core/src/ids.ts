const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

type RandomSource = { getRandomValues?: (array: Uint8Array) => Uint8Array };

/**
 * Erzeugt eine zufällige ID (20 Zeichen, Base62).
 * Keine fortlaufenden Nummern, damit mehrere Geräte unabhängig voneinander Einträge anlegen können.
 */
export function createId(): string {
  const bytes = new Uint8Array(20);
  const random = (globalThis as { crypto?: RandomSource }).crypto;
  if (random?.getRandomValues) {
    random.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let id = '';
  for (const byte of bytes) id += ALPHABET.charAt(byte % ALPHABET.length);
  return id;
}
