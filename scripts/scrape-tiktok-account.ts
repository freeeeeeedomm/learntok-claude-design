/**
 * Single-account TikTok scraper. Pulls N videos from a specific user
 * profile (e.g. @dafeiju_dogs) and upserts them into a chosen category
 * in video_pool.
 *
 * Run:
 *   npm run scrape:tiktok:account -- @handle category-slug 30
 *   npm run scrape:tiktok:account -- https://www.tiktok.com/@handle 跳舞_女 50
 *
 * Reuses the persistent Chrome profile in data/playwright-profile/ so
 * any login state (set up via the explore-mode scraper) is shared.
 *
 * Unlike scrape-tiktok.ts (explore mode, ignoreDuplicates: true), this
 * one uses a real upsert — re-running revives soft-deleted rows for the
 * same video_id and refreshes their created_at. Matches the per-URL
 * /api/admin/video-pool route's behavior.
 */

import { chromium, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { buildVideoUrl } from '../lib/tiktok-url';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const PROFILE_DIR = './data/playwright-profile';
const MAX_SCROLLS = 30;
const SCROLL_DELAY_MS = 1200;

interface Args {
  handle: string;
  category: string;
  count: number;
}

interface Candidate {
  id: string;
  author: string;
}

interface Verified extends Candidate {
  title: string | null;
  thumbnail_url: string | null;
  author_name: string;
}

function parseArgs(argv: string[]): Args {
  // tsx passes args after `--`. Expect [handle, category, count].
  const args = argv.slice(2);
  if (args.length < 3) {
    console.error(
      'Usage: npm run scrape:tiktok:account -- <@handle | profile_url> <category-slug> <count>'
    );
    process.exit(1);
  }
  const [rawHandle, category, rawCount] = args;
  const count = parseInt(rawCount, 10);
  if (Number.isNaN(count) || count < 1 || count > 200) {
    console.error('count must be an integer between 1 and 200');
    process.exit(1);
  }

  // Accept @handle, handle, or full profile URL.
  let handle = rawHandle.trim();
  const urlMatch = handle.match(/tiktok\.com\/@([^/?#]+)/);
  if (urlMatch) handle = urlMatch[1];
  handle = handle.replace(/^@/, '');
  if (!/^[A-Za-z0-9._]+$/.test(handle)) {
    console.error(`bad handle: ${rawHandle}`);
    process.exit(1);
  }

  return { handle, category, count };
}

async function dismissModals(page: Page): Promise<void> {
  // Login prompt and cookie banners can cover the feed; nuke common ones.
  await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    for (const d of dialogs) {
      const text = d.textContent ?? '';
      // Skip anything that doesn't look like a login/consent overlay.
      if (
        text.includes('登录') ||
        text.includes('Log in') ||
        text.includes('cookies') ||
        text.includes('Cookies')
      ) {
        (d as HTMLElement).style.display = 'none';
      }
    }
  });
}

async function collectVideoIds(
  page: Page,
  handle: string,
  needed: number
): Promise<Candidate[]> {
  const seen = new Map<string, string>();
  for (let i = 0; i < MAX_SCROLLS; i++) {
    if (seen.size >= needed * 1.5) break;
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(SCROLL_DELAY_MS);
    const batch: Array<{ id: string; author: string }> = await page.evaluate(
      (h) => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));
        const out: Array<{ id: string; author: string }> = [];
        for (const a of anchors) {
          const href = (a as HTMLAnchorElement).href;
          const m = href.match(/@([^/]+)\/video\/(\d+)/);
          if (m && m[1] === h) out.push({ author: m[1], id: m[2] });
        }
        return out;
      },
      handle
    );
    for (const { id, author } of batch) seen.set(id, author);
  }
  return [...seen.entries()].map(([id, author]) => ({ id, author }));
}

async function verifyEmbed(c: Candidate): Promise<Verified | null> {
  const url = buildVideoUrl({ videoId: c.id, author: c.author });
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const json: { title?: string; thumbnail_url?: string; author_name?: string } =
      await res.json();
    return {
      ...c,
      title: json.title ?? null,
      thumbnail_url: json.thumbnail_url ?? null,
      author_name: json.author_name ?? c.author,
    };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const { handle, category, count } = parseArgs(process.argv);
  console.log(`Scraping @${handle} → category "${category}" (target: ${count})`);

  const sb = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Confirm category exists (matches the API guard).
  const { data: cat } = await sb
    .from('categories')
    .select('slug')
    .eq('slug', category)
    .eq('is_active', true)
    .maybeSingle();
  if (!cat) {
    console.error(`category "${category}" not found or inactive in 'categories' table`);
    process.exit(1);
  }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  try {
    await page.goto(`https://www.tiktok.com/@${handle}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2500);
    await dismissModals(page);

    const candidates = await collectVideoIds(page, handle, count);
    console.log(`  collected ${candidates.length} candidate IDs`);

    const verified: Verified[] = [];
    for (const c of candidates) {
      if (verified.length >= count) break;
      const v = await verifyEmbed(c);
      if (v) verified.push(v);
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log(`  ${verified.length} embeddable (verified via oembed)`);

    if (verified.length === 0) {
      console.warn('no embeddable videos found — TikTok may be showing captcha');
      return;
    }

    const now = new Date().toISOString();
    // Real upsert (no ignoreDuplicates) — revives soft-deleted rows and
    // refreshes created_at, matching POST /api/admin/video-pool behavior.
    const { error: upsertErr } = await sb.from('video_pool').upsert(
      verified.map((v) => ({
        video_id: v.id,
        source: 'tiktok' as const,
        category,
        title: v.title,
        author: v.author_name,
        thumbnail_url: v.thumbnail_url,
        is_active: true,
        scraped_at: now,
        created_at: now,
      })),
      { onConflict: 'video_id' }
    );
    if (upsertErr) {
      console.error(`upsert failed: ${upsertErr.message}`);
      process.exit(1);
    }
    console.log(`  upserted ${verified.length} into video_pool / category="${category}"`);
  } finally {
    await ctx.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
