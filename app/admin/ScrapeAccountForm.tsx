'use client';

import { useMemo, useState } from 'react';

// Hardcoded since this is a single-user admin tool. If the repo moves,
// edit this constant.
const PROJECT_DIR = 'C:\\Users\\admin\\Desktop\\ClaudeProjects\\learntok-claude-design';

/**
 * Builds a two-line command (cd + npm run) for the user to copy and run
 * locally. The actual scrape runs in their terminal (Playwright +
 * persistent Chrome profile) — we intentionally don't run it from the
 * server because TikTok blocks Vercel-region IPs.
 *
 * Quotes around `@handle` are required: PowerShell parses bare `@x` as
 * a variable reference and errors out before npm even sees the arg.
 */
export function ScrapeAccountForm({ categories }: { categories: string[] }) {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState(categories[0] ?? '');
  const [count, setCount] = useState(30);
  const [copied, setCopied] = useState(false);

  // Extract clean @handle whether the user pasted a URL or just the handle.
  const handle = useMemo(() => {
    const t = account.trim();
    if (!t) return '';
    const urlMatch = t.match(/tiktok\.com\/@([^/?#]+)/);
    if (urlMatch) return urlMatch[1];
    return t.replace(/^@/, '');
  }, [account]);

  const command = useMemo(() => {
    if (!handle || !category || !count) return '';
    // Two lines: cd into project, then run. Handle is double-quoted so
    // PowerShell doesn't treat the leading @ as a variable reference.
    const cdLine = `cd "${PROJECT_DIR}"`;
    const runLine = `npm run scrape:tiktok:account -- "@${handle}" ${category} ${count}`;
    return `${cdLine}\n${runLine}`;
  }, [handle, category, count]);

  const copy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — the textarea is selectable as fallback
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
        style={{ alignSelf: 'flex-start', fontSize: 13, padding: '8px 14px' }}
        data-testid="admin-scrape-account-trigger"
      >
        🎬 抓账号 (本地命令)
      </button>
    );
  }

  return (
    <div
      className="card col gap-12"
      style={{ padding: 12 }}
      data-testid="admin-scrape-account-form"
    >
      <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="@handle 或 https://www.tiktok.com/@handle"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          style={{
            flex: '1 1 240px',
            padding: 8,
            fontSize: 13,
            border: '1px solid #ddd',
            borderRadius: 4,
          }}
          data-testid="admin-scrape-account-input"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={categories.length === 0}
          style={{
            padding: 8,
            fontSize: 13,
            border: '1px solid #ddd',
            borderRadius: 4,
          }}
          data-testid="admin-scrape-account-category"
        >
          {categories.length === 0 ? (
            <option value="">(没有分类)</option>
          ) : (
            categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))
          )}
        </select>
        <input
          type="number"
          min={1}
          max={200}
          value={count}
          onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
          style={{
            width: 80,
            padding: 8,
            fontSize: 13,
            border: '1px solid #ddd',
            borderRadius: 4,
          }}
          data-testid="admin-scrape-account-count"
        />
      </div>

      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-mute)',
        }}
      >
        本地终端粘贴下面两行(scraper 用持久化 Chrome,反爬绕得过):
      </div>

      <pre
        style={{
          margin: 0,
          padding: 10,
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          background: 'var(--bg-2)',
          borderRadius: 4,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          color: command ? 'var(--ink)' : 'var(--ink-mute)',
        }}
        data-testid="admin-scrape-account-command"
      >
        {command || '# 填上账号、分类、数量,这里会出命令'}
      </pre>

      <div className="row gap-8">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setOpen(false);
            setAccount('');
            setCopied(false);
          }}
          style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
        >
          关闭
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={copy}
          disabled={!command}
          data-testid="admin-scrape-account-copy"
          style={{ flex: 2, fontSize: 12, padding: '6px 8px' }}
        >
          {copied ? '✓ 已复制' : '📋 复制命令'}
        </button>
      </div>
    </div>
  );
}
