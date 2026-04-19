import { requireAdmin } from '@/lib/admin-auth';
import { createClient } from '@/lib/supabase/server';
import { AdminPoolView } from './AdminPoolView';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await requireAdmin();

  const supabase = createClient();

  const [catsRes, vidsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('slug, display_order')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('video_pool')
      .select('id, video_id, source, category, title, author, thumbnail_url')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
  ]);

  const categories = catsRes.data ?? [];
  const videos = vidsRes.data ?? [];

  return (
    <main className="app">
      <div className="pad pad-top">
        <div className="eyebrow">🛡️ admin</div>
        <div className="display mt-4" style={{ fontSize: 26 }}>
          video pool
        </div>
        <AdminPoolView categories={categories} videos={videos} />
      </div>
    </main>
  );
}
