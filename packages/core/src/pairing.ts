const LINK_PREFIX = 'zauberjournal://household/join?';

export type PairingInfo = { serverUrl: string; code: string };

/**
 * Link für den QR-Code zum Beitreten. Mit der Kamera-App gescannt öffnet er direkt die App
 * (im fertigen Build); die App selbst liest ihn auch mit dem eingebauten Scanner.
 */
export function createPairingLink({ serverUrl, code }: PairingInfo): string {
  return `${LINK_PREFIX}server=${encodeURIComponent(serverUrl)}&code=${encodeURIComponent(code)}`;
}

/** Liest einen Beitritts-Link; `null`, wenn der Text kein solcher Link ist. */
export function parsePairingLink(text: string): PairingInfo | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(LINK_PREFIX)) return null;
  const params = new Map<string, string>();
  for (const part of trimmed.slice(LINK_PREFIX.length).split('&')) {
    const [key, value = ''] = part.split('=');
    try {
      if (key) params.set(key, decodeURIComponent(value));
    } catch {
      return null;
    }
  }
  const serverUrl = params.get('server');
  const code = params.get('code');
  return serverUrl && code ? { serverUrl, code } : null;
}

/** Vereinheitlicht eine eingegebene Server-Adresse: ohne Schrägstrich am Ende, standardmäßig mit https://. */
export function normalizeServerUrl(input: string): string {
  const url = input.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Zeigt einen Code in Vierergruppen an, z. B. „93ZK-JDE6“. */
export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}
