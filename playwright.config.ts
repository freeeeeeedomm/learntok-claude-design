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
    baseURL: process.env.PW_BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: { 'content-type': 'application/json' },
  },
  webServer: {
    // PW_PORT lets a sibling worktree's dev server keep using 3000 while this
    // one runs on a different port (e.g. 3001) without colliding.
    command: process.env.PW_PORT ? `next dev -p ${process.env.PW_PORT}` : 'npm run dev',
    url: process.env.PW_BASE_URL ?? 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
