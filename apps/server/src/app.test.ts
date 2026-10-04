import { describe, expect, it } from 'vitest';

import { app } from './app.ts';

describe('GET /api/health', () => {
  it('meldet den Server als bereit', async () => {
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', name: 'Zauberjournal' });
  });
});
