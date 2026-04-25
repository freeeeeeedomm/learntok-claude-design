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
import { mkdir } from 'fs/promises';
import { createInterface } from 'readline';
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

async function waitForEnter(prompt: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function hasVideoTiles(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelectorAll('a[href*="/video/"]').length
  );
}

async function isLoggedIn(page: Page): Promise<boolean> {
  // Crude but effective: when logged out, TikTok renders huge `登录` /
  // `Log in` CTAs in the top-right and sidebar. When logged in, those
  // disappear and a profile avatar shows up.
  return page.evaluate(() => {
    const text = document.body.innerText;
    // If "登录" appears multiple times we're almost certainly logged out.
    const loginCount = (text.match(/登录|Log in/g) ?? []).length;
    return loginCount < 2;
  });
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

interface ScrollSnapshot {
  iter: number;
  anchors: number;
  matched: number;
  firstHrefs: string[];
}

async function collectVideoIds(
  page: Page,
  handle: string,
  needed: number
): Promise<{ candidates: Candidate[]; snapshots: ScrollSnapshot[] }> {
  const seen = new Map<string, string>();
  const snapshots: ScrollSnapshot[] = [];
  // Match handle case-insensitively (TikTok stores them lowercase but the
  // user might paste a mixed-case handle).
  const handleLc = handle.toLowerCase();

  for (let i = 0; i < MAX_SCROLLS; i++) {
    if (seen.size >= needed * 1.5) break;
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(SCROLL_DELAY_MS);
    const result: {
      anchors: number;
      matched: { id: string; author: string }[];
      firstHrefs: string[];
    } = await page.evaluate((h) => {
      const all = Array.from(document.querySelectorAll('a[href*="/video/"]'));
      const matched: Array<{ id: string; author: string }> = [];
      const firstHrefs: string[] = [];
      for (const a of all) {
        const href = (a as HTMLAnchorElement).href;
        if (firstHrefs.length < 3) firstHrefs.push(href);
        const m = href.match(/@([^/]+)\/video\/(\d+)/);
        if (m && m[1].toLowerCase() === h) {
          matched.push({ author: m[1], id: m[2] });
        }
      }
      return { anchors: all.length, matched, firstHrefs };
    }, handleLc);

    snapshots.push({
      iter: i,
      anchors: result.anchors,
      matched: result.matched.length,
      firstHrefs: result.firstHrefs,
    });
    for (const { id, author } of result.matched) seen.set(id, author);
  }
  return {
    candidates: [...seen.entries()].map(([id, author]) => ({ id, author })),
    snapshots,
  };
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
    const profileUrl = `https://www.tiktok.com/@${handle}`;
    console.log(`  goto ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
    await page
      .waitForSelector('a[href*="/video/"], [data-e2e="user-post-item"]', {
        timeout: 8000,
      })
      .catch(() => null);
    await page.waitForTimeout(1500);
    await dismissModals(page);

    // TikTok profile pages refuse to render the video grid for
    // logged-out / bot-suspected sessions ("出错了, 请稍后重试"). If
    // we see no tiles, give the user a chance to log in interactively.
    let tileCount = await hasVideoTiles(page);
    const loggedIn = await isLoggedIn(page);
    if (tileCount === 0) {
      console.log('');
      console.log('  ⚠ no video tiles found on the profile page.');
      if (!loggedIn) {
        console.log('  Looks like you are NOT logged in to TikTok.');
        console.log(
          '  Switch to the open Chrome window, log in (account / QR / Google etc.),'
        );
        console.log('  then come back here.');
      } else {
        console.log(
          '  You appear to be logged in but the grid did not render — captcha?'
        );
        console.log(
          '  Switch to the Chrome window, solve any challenge / refresh, then come back.'
        );
      }
      await waitForEnter('  >>> press ENTER when the video grid is visible: ');
      // Give it a moment to settle, then re-check.
      await page.waitForTimeout(1000);
      tileCount = await hasVideoTiles(page);
      if (tileCount === 0) {
        console.warn(
          '  still no tiles after manual step — re-navigating once more.'
        );
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        tileCount = await hasVideoTiles(page);
      }
      console.log(`  now seeing ${tileCount} video anchor(s); resuming scroll.`);
    }

    const { candidates, snapshots } = await collectVideoIds(page, handle, count);
    console.log(`  collected ${candidates.length} candidate IDs`);

    if (candidates.length === 0) {
      // Diagnostic dump so we can tell whether the page didn't load,
      // anti-bot intercepted, or our filter is wrong.
      const last = snapshots[snapshots.length - 1];
      console.log('  diagnostic:');
      console.log(`    final URL: ${page.url()}`);
      console.log(`    page title: ${await page.title()}`);
      if (last) {
        console.log(
          `    last scroll: anchors=${last.anchors} matched=${last.matched}`
        );
        if (last.firstHrefs.length) {
          console.log('    sample anchor hrefs:');
          last.firstHrefs.forEach((h) => console.log(`      ${h}`));
        }
      }
      try {
        await mkdir('./data', { recursive: true });
        const shotPath = `./data/scrape-debug-${handle}.png`;
        await page.screenshot({ path: shotPath, fullPage: false });
        console.log(`    screenshot saved → ${shotPath}`);
      } catch (e) {
        console.warn(`    screenshot failed: ${(e as Error).message}`);
      }
      console.warn(
        '  no candidates found — check the screenshot. likely causes: login wall, captcha, or page never rendered.'
      );
      return;
    }

    const verified: Verified[] = [];
    for (const c of candidates) {
      if (verified.length >= count) break;
      const v = await verifyEmbed(c);
      if (v) verified.push(v);
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log(`  ${verified.length} embeddable (verified via oembed)`);

    if (verified.length === 0) {
      console.warn('no embeddable videos passed oembed verification');
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
