import { requireAdmin } from '@/lib/admin-auth';
import { adminClient } from '@/lib/supabase/server';
import { CategoryView } from '../CategoryView';

export const dynamic = 'force-dynamic';

export default async function AllVideosPage() {
  await requireAdmin();
  const supabase = adminClient();
  const { data: vids } = await supabase
    .from('video_pool')
    .select('id, video_id, source, category, title, author, thumbnail_url')
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
          全部 · {vids?.length ?? 0} 条
        </div>
        <CategoryView
          initialVideos={vids ?? []}
          categoryLabel="全部"
          slug={null}
        />
      </div>
    </main>
  );
}
