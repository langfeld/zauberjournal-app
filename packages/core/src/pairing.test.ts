import { describe, expect, it } from 'vitest';

import { createPairingLink, formatCode, normalizeServerUrl, parsePairingLink } from './pairing.ts';

describe('Beitritts-Link', () => {
  it('kodiert Server und Code und liest sie wieder aus', () => {
    const info = { serverUrl: 'https://kochbuch.example.de:8443/pfad', code: '93ZKJDE6' };
    const link = createPairingLink(info);
    expect(link).toBe(
      'zauberjournal://household/join?server=https%3A%2F%2Fkochbuch.example.de%3A8443%2Fpfad&code=93ZKJDE6',
    );
    expect(parsePairingLink(link)).toEqual(info);
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

describe('formatCode', () => {
  it('gruppiert in Vierergruppen', () => {
    expect(formatCode('93ZKJDE6')).toBe('93ZK-JDE6');
    expect(formatCode('YGWTFY6MFS9T')).toBe('YGWT-FY6M-FS9T');
  });
});
