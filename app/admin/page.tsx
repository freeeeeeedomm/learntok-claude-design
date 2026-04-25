import { requireAdmin } from '@/lib/admin-auth';
import { adminClient } from '@/lib/supabase/server';
import { NewCategoryForm } from './NewCategoryForm';
import { NewVideoFormPicker } from './NewVideoFormPicker';

export const dynamic = 'force-dynamic';

export default async function AdminIndex() {
  await requireAdmin();
  const supabase = adminClient();

  const [catsRes, vidsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('slug, display_order')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('video_pool')
      .select('category, video_id')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
  ]);

  const categories = catsRes.data ?? [];
  const vids = vidsRes.data ?? [];

  const counts = new Map<string, number>();
  const samples = new Map<string, string>();
  for (const r of vids) {
    counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    if (!samples.has(r.category)) samples.set(r.category, r.video_id);
  }
  const total = vids.length;
  const heroSample = vids[0]?.video_id ?? null;

  return (
    <main className="app">
      <div className="pad pad-top">
        <div className="eyebrow">🛡️ admin</div>
        <div className="display mt-4" style={{ fontSize: 26 }}>
          video pool
        </div>

        <div className="mt-12">
          <NewVideoFormPicker categories={categories.map((c) => c.slug)} />
        </div>

        <a
          href="/admin/all"
          className="card card-hl mt-16"
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            textDecoration: 'none',
            color: 'inherit',
          }}
          data-testid="admin-all-hero"
        >
          <div
            style={{
              width: 60,
              height: 80,
              flexShrink: 0,
              background: 'var(--bg-2)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {heroSample && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/admin/video-pool/thumbnail/${heroSample}`}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>
          <div>
            <div className="eyebrow">全部</div>
            <div className="display" style={{ fontSize: 22 }}>
              {total} 条
            </div>
          </div>
        </a>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 12,
            marginTop: 16,
          }}
          data-testid="admin-category-grid"
        >
          {categories.map((c) => {
            const sample = samples.get(c.slug);
            const count = counts.get(c.slug) ?? 0;
            return (
              <a
                key={c.slug}
                href={`/admin/${encodeURIComponent(c.slug)}`}
                className="card"
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  padding: 8,
                }}
                data-testid={`admin-category-card-${c.slug}`}
              >
                <div
                  style={{
                    aspectRatio: '9 / 16',
                    background: 'var(--bg-2)',
                    borderRadius: 6,
                    overflow: 'hidden',
                    marginBottom: 6,
                  }}
                >
                  {sample ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/admin/video-pool/thumbnail/${sample}`}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      className="row aic jc"
                      style={{
                        width: '100%',
                        height: '100%',
                        color: 'var(--ink-mute)',
                        fontSize: 11,
                      }}
                    >
                      (空)
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.slug}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
                  {count} 条
                </div>
              </a>
            );
          })}

          <NewCategoryForm />
        </div>
      </div>
    </main>
  );
}
