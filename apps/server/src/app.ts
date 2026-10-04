import { APP_NAME } from '@zauberjournal/core';
import { Hono } from 'hono';

export const app = new Hono();

app.get('/api/health', (c) => c.json({ status: 'ok', name: APP_NAME }));
