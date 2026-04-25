import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { adminClient } from '@/lib/supabase/server';
import { CategoryView } from '../CategoryView';

export const dynamic = 'force-dynamic';

export default async function CategoryPage({
  params,
}: {
  params: { slug: string };
}) {
  await requireAdmin();
  const slug = decodeURIComponent(params.slug);

  // /admin/all has its own static route; never resolve it as a category.
  if (slug === 'all') notFound();

  const supabase = adminClient();
  const { data: cat } = await supabase
    .from('categories')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!cat) notFound();

  const { data: vids } = await supabase
    .from('video_pool')
    .select('id, video_id, source, category, title, author, thumbnail_url')
    .eq('category', slug)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return (
    <main className="app">
      <div className="pad pad-top">
        <a
          href="/admin"
          className="eyebrow"
          style={{ textDecoration: 'underline' }}
        >
          ← 全部分类
        </a>
        <div className="display mt-4" style={{ fontSize: 26 }}>
          {slug}
        </div>
        <CategoryView
          initialVideos={vids ?? []}
          categoryLabel={slug}
          slug={slug}
        />
      </div>
    </main>
  );
}
