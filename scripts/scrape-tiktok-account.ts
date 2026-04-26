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

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { BrowserContext, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdir } from 'fs/promises';
import { createInterface } from 'readline';
import { buildVideoUrl } from '../lib/tiktok-url';

// Stealth plugin: patches navigator.webdriver, plugins, languages,
// permissions etc. so TikTok's anti-bot doesn't immediately serve us
// captcha / empty item lists. Combined with `channel: 'chrome'` (real
// installed Chrome instead of bundled Chromium), this is usually
// enough to let QR / email login succeed.
chromium.use(StealthPlugin());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

// Separate from the explore-mode scraper's Chromium profile because we
// switched to real Chrome (channel: 'chrome'). Mixing data dirs across
// browser binaries can corrupt the profile.
const PROFILE_DIR = './data/playwright-profile-chrome';
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

/**
 * Set up a network response listener that captures TikTok's item-list
 * API responses. The SSR'd HTML doesn't contain the user's video list —
 * those load via XHR after the page mounts. Intercepting them is the
 * most reliable extraction path.
 *
 * Returns a `harvest()` function that walks captured responses for
 * candidates whose author matches `handle`.
 */
function attachItemListInterceptor(
  context: BrowserContext,
  handle: string
): {
  harvest: () => Candidate[];
  count: () => number;
} {
  const handleLc = handle.toLowerCase();
  const captured: unknown[] = [];

  context.on('response', async (resp) => {
    const url = resp.url();
    // TikTok's item-list / playlist / collection endpoints. Loose
    // match — they tweak path versions periodically. Witnessed in the
    // wild on a clean Chromium load:
    //   /api/post/item_list/?...
    //   /api/user/collection_list/?...
    if (
      !/\/api\/(post|user|playlist|post_v[0-9])\/.*list/i.test(url) &&
      !/\/api\/playlist\/item/i.test(url)
    ) {
      return;
    }
    try {
      const ct = resp.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      const json: unknown = await resp.json();
      captured.push(json);
    } catch {
      // Ignore — body might already be consumed or non-JSON
    }
  });

  const harvest = (): Candidate[] => {
    const seen = new Map<string, string>();
    const stack: unknown[] = [...captured];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object') continue;
      if (Array.isArray(cur)) {
        for (let i = 0; i < cur.length; i++) stack.push(cur[i]);
        continue;
      }
      const o = cur as Record<string, unknown>;
      const looksLikeVideo =
        typeof o.id === 'string' &&
        /^\d{15,20}$/.test(o.id) &&
        (typeof o.desc === 'string' ||
          (o.video !== null && typeof o.video === 'object') ||
          (o.stats !== null && typeof o.stats === 'object') ||
          typeof o.createTime === 'number');
      if (looksLikeVideo) {
        let author = handleLc;
        const a = o.author as Record<string, unknown> | undefined;
        if (a && typeof a.uniqueId === 'string') author = a.uniqueId;
        else if (typeof o.authorName === 'string') author = o.authorName;
        // Only keep videos whose author matches the requested handle
        // (item_list responses sometimes include "you might like" mixed in).
        if (
          author.toLowerCase() === handleLc &&
          !seen.has(o.id as string)
        ) {
          seen.set(o.id as string, author);
        }
      }
      for (const key of Object.keys(o)) stack.push(o[key]);
    }
    return [...seen.entries()].map(([id, author]) => ({ id, author }));
  };

  return {
    harvest,
    count: () => captured.length,
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
    channel: 'chrome', // real installed Chrome, not bundled Chromium
    viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  // Hook the network interceptor BEFORE any navigation so we don't miss
  // the very first item-list response.
  const interceptor = attachItemListInterceptor(ctx, handle);

  // Scroll to trigger lazy-load API calls. Exits as soon as we have
  // `target` candidates — no point pulling more, oembed verification
  // is slow. Stagnant detection only kicks in for tiny accounts where
  // we'd otherwise scroll forever waiting to hit target.
  const scrollUntilEnough = async (target: number, maxScrolls = 30) => {
    let lastCount = interceptor.harvest().length;
    let stagnant = 0;
    for (let i = 0; i < maxScrolls; i++) {
      const have = interceptor.harvest().length;
      if (have >= target) return; // got enough, stop
      if (stagnant >= 3) return; // 3 empty scrolls in a row = feed end
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await page.waitForTimeout(SCROLL_DELAY_MS);
      const newCount = interceptor.harvest().length;
      if (newCount === lastCount) stagnant++;
      else {
        stagnant = 0;
        lastCount = newCount;
      }
    }
  };

  const candidatesMap = new Map<string, string>();
  const mergeFromInterceptor = (label: string) => {
    const got = interceptor.harvest();
    const before = candidatesMap.size;
    for (const c of got) candidatesMap.set(c.id, c.author);
    const added = candidatesMap.size - before;
    console.log(
      `    [${label}] +${added} from API (${interceptor.count()} responses captured, total unique: ${candidatesMap.size})`
    );
  };

  try {
    const profileUrl = `https://www.tiktok.com/@${handle}`;
    console.log(`  goto ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await dismissModals(page);
    // Aim for 2x count so oembed-failures don't drop us under target.
    await scrollUntilEnough(Math.max(count * 2, 20));
    mergeFromInterceptor('initial');

    // If 0 — TikTok served an empty itemList because we're not
    // authenticated. Pause and let the user log in (or solve a
    // captcha) in the visible Chrome window, then retry.
    if (candidatesMap.size === 0) {
      const loggedIn = await isLoggedIn(page);
      console.log('');
      if (!loggedIn) {
        console.log('  ⚠ Not logged in — TikTok returns empty list.');
        console.log('  In the open Chrome:');
        console.log('   1. Click the 登录 button');
        console.log('   2. Pick "使用手机/邮箱" (QR scan or email/password)');
        console.log('   3. Sign in');
      } else {
        console.log(
          '  ⚠ Logged in but list still empty — captcha? Solve it in Chrome.'
        );
      }
      console.log('   4. Wait until you see the user video grid populated');
      await waitForEnter('  >>> then press ENTER here to continue: ');

      // Re-navigate so a fresh item-list request fires now that we have
      // an authenticated session. Then scroll to trigger more pages.
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await scrollUntilEnough(Math.max(count * 2, 20));
      mergeFromInterceptor('after-login');
    }

    const candidates: Candidate[] = [...candidatesMap.entries()].map(
      ([id, author]) => ({ id, author })
    );
    console.log(`  collected ${candidates.length} candidate IDs total`);

    if (candidates.length === 0) {
      console.log('  diagnostic:');
      console.log(`    final URL: ${page.url()}`);
      console.log(`    page title: ${await page.title()}`);
      console.log(`    API responses captured: ${interceptor.count()}`);
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
