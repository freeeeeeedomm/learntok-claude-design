import { defineConfig } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually — Playwright doesn't pick up Next.js env files.
try {
  const envPath = resolve(__dirname, '.env.local');
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const [, k, v] = m;
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,         // tests share the dev user; serialize to avoid races
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'content-type': 'application/json' },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
