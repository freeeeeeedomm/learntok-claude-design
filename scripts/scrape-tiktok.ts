/**
 * Local TikTok explore scraper. Pulls 30 verified-embeddable videos per
 * active category from tiktok.com/explore and upserts them into the
 * video_pool Supabase table.
 *
 * Run: npm run scrape:tiktok
 *
 * First run pops a Chrome window. If TikTok prompts for login, log in
 * once — the persistent profile in data/playwright-profile/ saves the
 * session for subsequent runs.
 */

import { chromium, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { buildVideoUrl } from '../lib/tiktok-url';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const TARGET_PER_CATEGORY = 30;
const MAX_SCROLLS = 20;
const SCROLL_DELAY_MS = 1200;
const PROFILE_DIR = './data/playwright-profile';
const AUDIT_OUT = './data/tiktok-pool.json';

interface Candidate {
  id: string;
  author: string;
}

interface Verified extends Candidate {
  title: string | null;
  thumbnail_url: string | null;
  author_name: string;
}

async function hideInterestModal(page: Page): Promise<void> {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue?.includes('你希望在')) {
        let el = (node as Text).parentElement;
        for (let i = 0; i < 12 && el; i++) {
          const role = el.getAttribute('role');
          if (role === 'dialog') {
            (el as HTMLElement).style.display = 'none';
            return;
          }
          el = el.parentElement;
        }
      }
    }
  });
}

async function clickCategoryChip(page: Page, slug: string): Promise<boolean> {
  return page.evaluate((s) => {
    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const target = btns.find((b) => b.textContent?.trim() === s);
    if (!target) return false;
    (target as HTMLElement).click();
    return true;
  }, slug);
}

async function collectIds(page: Page): Promise<Candidate[]> {
  const seen = new Map<string, string>();
  for (let i = 0; i < MAX_SCROLLS; i++) {
    if (seen.size >= TARGET_PER_CATEGORY * 2) break; // collect 2x target so verification can drop some
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(SCROLL_DELAY_MS);
    const batch: Array<{ id: string; author: string }> = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));
      const out: Array<{ id: string; author: string }> = [];
      for (const a of anchors) {
        const m = (a as HTMLAnchorElement).href.match(/@([^/]+)\/video\/(\d+)/);
        if (m) out.push({ author: m[1], id: m[2] });
      }
      return out;
    });
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
  const sb = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: cats, error: catsErr } = await sb
    .from('categories')
    .select('slug')
    .eq('is_active', true)
    .order('display_order');

  if (catsErr || !cats) {
    console.error('failed to load categories:', catsErr?.message);
    process.exit(1);
  }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  const audit: Record<string, Verified[]> = {};

  for (const { slug } of cats) {
    console.log(`\n=== ${slug} ===`);
    await page.goto('https://www.tiktok.com/explore', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500); // let initial videos paint
    await hideInterestModal(page);

    const clicked = await clickCategoryChip(page, slug);
    if (!clicked) {
      console.warn(`  [skip] could not find category chip for "${slug}"`);
      continue;
    }
    await page.waitForTimeout(2000);
    await hideInterestModal(page); // modal can re-appear after category click

    const candidates = await collectIds(page);
    console.log(`  collected ${candidates.length} candidate IDs`);

    const verified: Verified[] = [];
    for (const c of candidates) {
      if (verified.length >= TARGET_PER_CATEGORY) break;
      const v = await verifyEmbed(c);
      if (v) verified.push(v);
      await new Promise((r) => setTimeout(r, 100)); // gentle on oembed
    }
    console.log(`  ${verified.length} embeddable (verified via oembed)`);

    audit[slug] = verified;

    if (verified.length === 0) {
      console.warn(`  [skip-upsert] no embeddable videos for "${slug}"`);
      continue;
    }

    const { error: upsertErr } = await sb.from('video_pool').upsert(
      verified.map((v) => ({
        video_id: v.id,
        source: 'tiktok' as const,
        category: slug,
        title: v.title,
        author: v.author_name,
        thumbnail_url: v.thumbnail_url,
        scraped_at: new Date().toISOString(),
      })),
      { onConflict: 'video_id', ignoreDuplicates: true }
    );
    if (upsertErr) {
      console.error(`  [error] upsert failed: ${upsertErr.message}`);
    } else {
      console.log(`  upserted ${verified.length} into video_pool`);
    }
  }

  await ctx.close();

  await mkdir(dirname(AUDIT_OUT), { recursive: true });
  await writeFile(AUDIT_OUT, JSON.stringify(audit, null, 2));
  console.log(`\nWrote audit trail → ${AUDIT_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
