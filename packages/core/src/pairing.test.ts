import { describe, expect, it } from 'vitest';

import { createPairingLink, formatCode, isLocalHost, normalizeServerUrl, parsePairingLink, serverUrlProblem } from './pairing.ts';

describe('Beitritts-Link', () => {
  it('kodiert Server und Code und liest sie wieder aus', () => {
    const info = { serverUrl: 'https://kochbuch.example.de:8443/pfad', code: '93ZKJDE6' };
    const link = createPairingLink(info);
    expect(link).toBe(
      'zauberjournal://household/join?server=https%3A%2F%2Fkochbuch.example.de%3A8443%2Fpfad&code=93ZKJDE6',
    );
    expect(parsePairingLink(link)).toEqual(info);
  });

  it('nimmt die Adresse für zu Hause mit; ältere Links ohne sie gelten weiter', () => {
    const info = { serverUrl: 'https://kochbuch.example.de', homeUrl: 'http://192.168.178.20:3000', code: '93ZKJDE6' };
    const link = createPairingLink(info);
    expect(link).toBe(
      'zauberjournal://household/join?server=https%3A%2F%2Fkochbuch.example.de&home=http%3A%2F%2F192.168.178.20%3A3000&code=93ZKJDE6',
    );
    expect(parsePairingLink(link)).toEqual(info);
    expect(parsePairingLink('zauberjournal://household/join?server=https%3A%2F%2Fa.de&code=X')).toEqual({
      serverUrl: 'https://a.de',
      code: 'X',
    });
  });

  it('erkennt fremde Inhalte', () => {
    expect(parsePairingLink('https://example.de')).toBeNull();
    expect(parsePairingLink('zauberjournal://household/join?code=ABC')).toBeNull();
    expect(parsePairingLink('zauberjournal://household/join?server=%E0%A4%A&code=ABC')).toBeNull();
  });
});

describe('normalizeServerUrl', () => {
  it('ergänzt https:// und entfernt Schrägstriche am Ende', () => {
    expect(normalizeServerUrl(' kochbuch.example.de/ ')).toBe('https://kochbuch.example.de');
    expect(normalizeServerUrl('http://192.168.1.10:3000')).toBe('http://192.168.1.10:3000');
  });
});

describe('Server-Adressen prüfen', () => {
  it('erlaubt http:// nur im eigenen Netz', () => {
    for (const url of [
      'https://kochbuch.example.de',
      'https://kochbuch.example.de:8443/pfad',
      'http://192.168.178.20:3000',
      'http://10.0.0.5',
      'http://172.20.1.1:3000',
      'http://100.101.102.103:3000',
      'http://localhost:3000',
      'http://nas:3000',
      'http://truenas.local:3000',
      'http://nas.fritz.box',
      'http://[fd00::12]:3000',
    ]) {
      expect(serverUrlProblem(url), url).toBeNull();
    }
    for (const url of ['http://kochbuch.example.de', 'http://172.32.0.1:3000', 'http://8.8.8.8', 'http://[2001:db8::1]']) {
      expect(serverUrlProblem(url), url).toMatch(/nur im eigenen Netz/);
    }
  });

  it('erkennt Unsinn', () => {
    for (const url of ['https://', 'https://exa mple.de', 'ftp://example.de', 'https://user@example.de', 'https://a.de?x=1']) {
      expect(serverUrlProblem(url), url).toMatch(/keine gültige Adresse/);
    }
  });

  it('kennt lokale Rechner', () => {
    expect(isLocalHost('192.168.0.1')).toBe(true);
    expect(isLocalHost('169.254.3.4')).toBe(true);
    expect(isLocalHost('[::1]')).toBe(true);
    expect(isLocalHost('[fe80::1]')).toBe(true);
    expect(isLocalHost('example.de')).toBe(false);
    expect(isLocalHost('192.169.0.1')).toBe(false);
    expect(isLocalHost('100.128.0.1')).toBe(false);
  });
});

describe('formatCode', () => {
  it('gruppiert in Vierergruppen', () => {
    expect(formatCode('93ZKJDE6')).toBe('93ZK-JDE6');
    expect(formatCode('YGWTFY6MFS9T')).toBe('YGWT-FY6M-FS9T');
  });
});
