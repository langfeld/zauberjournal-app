const LINK_PREFIX = 'zauberjournal://household/join?';

/** `serverUrl`: Adresse für unterwegs; `homeUrl`: Adresse im WLAN zu Hause, falls es eine gibt. */
export type PairingInfo = { serverUrl: string; code: string; homeUrl?: string };

/**
 * Link für den QR-Code zum Beitreten. Mit der Kamera-App gescannt öffnet er direkt die App
 * (im fertigen Build); die App selbst liest ihn auch mit dem eingebauten Scanner.
 */
export function createPairingLink({ serverUrl, homeUrl, code }: PairingInfo): string {
  const home = homeUrl ? `&home=${encodeURIComponent(homeUrl)}` : '';
  return `${LINK_PREFIX}server=${encodeURIComponent(serverUrl)}${home}&code=${encodeURIComponent(code)}`;
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
  const homeUrl = params.get('home');
  const code = params.get('code');
  if (!serverUrl || !code) return null;
  return homeUrl ? { serverUrl, homeUrl, code } : { serverUrl, code };
}

/** Vereinheitlicht eine eingegebene Server-Adresse: ohne Schrägstrich am Ende, standardmäßig mit https://. */
export function normalizeServerUrl(input: string): string {
  const url = input.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Namen, die nur im eigenen Netz gelten, enden so, z. B. „truenas.local“ oder „nas.fritz.box“. */
const LOCAL_SUFFIXES = ['.local', '.lan', '.home', '.home.arpa', '.internal', '.intranet', '.fritz.box', '.localhost'];

/**
 * Ob ein Rechner im eigenen Netz liegt: private IPv4-Bereiche (auch die von VPNs wie Tailscale), lokale Namen
 * und Namen ohne Punkt wie „nas“. IPv6 steht in eckigen Klammern wie in der Adresse.
 */
export function isLocalHost(host: string): boolean {
  const name = host.toLowerCase();
  if (name.startsWith('[')) {
    // ::1, Link-local fe80::/10 und eigene Netze fc00::/7
    const ip = name.slice(1, -1);
    return ip === '::1' || /^fe[89ab][0-9a-f]?:/.test(ip) || /^f[cd][0-9a-f]{0,2}:/.test(ip);
  }
  const ipv4 = name.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  return name === 'localhost' || !name.includes('.') || LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * Prüft eine vereinheitlichte Server-Adresse (`normalizeServerUrl`); liefert eine Fehlermeldung oder `null`.
 * Unverschlüsselt (`http://`) nur im eigenen Netz, sonst ginge das Token des Geräts offen durchs Internet.
 */
export function serverUrlProblem(url: string): string | null {
  const match = url.match(/^(https?):\/\/(\[[0-9a-f:.]+\]|[^/?#:@\s[\]]+)(?::\d{1,5})?(?:\/[^\s?#]*)?$/i);
  if (!match) return `„${url}“ ist keine gültige Adresse, z. B. https://kochbuch.example.de`;
  if (match[1]!.toLowerCase() === 'http' && !isLocalHost(match[2]!)) {
    return 'Unverschlüsselt (http://) geht nur im eigenen Netz, z. B. http://192.168.178.20:3000. Adressen im Internet brauchen https://.';
  }
  return null;
}

/** Zeigt einen Code in Vierergruppen an, z. B. „93ZK-JDE6“. */
export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}
