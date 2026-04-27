import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtBank } from '@/lib/format';
import { LucideIcon } from '@/components/discover/LucideIcon';
import { TopicGrid } from '@/components/discover/TopicGrid';

export default async function DiscoverPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [profileRes, groupsRes, topicsRes, importedRes, presetCoursesRes] =
    await Promise.all([
      supabase.from('profiles').select('jar_balance_cached').eq('id', user.id).single(),
      supabase
        .from('topic_groups')
        .select('id, key, title, icon, position')
        .eq('is_preset', true)
        .order('position', { ascending: true }),
      supabase
        .from('topics')
        .select('id, group_id, title, icon, position')
        .eq('is_preset', true)
        .not('group_id', 'is', null)
        .order('position', { ascending: true }),
      // Owner-owned topics that point back at a preset via source_topic_id.
      // The unique partial index `topics_owner_source_uniq` guarantees at
      // most one row per (owner, source) pair, so the map below is well-
      // defined. Discover uses this to flip each card's CTA between
      // "+ add to home" and "open".
      supabase
        .from('topics')
        .select('id, source_topic_id')
        .eq('owner_id', user.id)
        .not('source_topic_id', 'is', null),
      // Per-topic course count for the tile subtitle. Preset catalog only —
      // user-added courses aren't shown on /discover.
      supabase
        .from('courses')
        .select('id, topic_id')
        .eq('is_preset', true)
        .not('topic_id', 'is', null),
    ]);

  const groups = groupsRes.data ?? [];
  const topics = topicsRes.data ?? [];

  const importedByPresetId = new Map<string, string>();
  for (const row of importedRes.data ?? []) {
    if (row.source_topic_id) importedByPresetId.set(row.source_topic_id, row.id);
  }

  const courseCounts = new Map<string, number>();
  for (const c of presetCoursesRes.data ?? []) {
    if (!c.topic_id) continue;
    courseCounts.set(c.topic_id, (courseCounts.get(c.topic_id) ?? 0) + 1);
  }

  const topicsByGroup = new Map<string, typeof topics>();
  for (const t of topics) {
    if (!t.group_id) continue;
    const arr = topicsByGroup.get(t.group_id) ?? [];
    arr.push(t);
    topicsByGroup.set(t.group_id, arr);
  }

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="discover-back">‹</a>
        <a href="/profile" className="jar-chip" data-testid="discover-jar-chip">
          <span className="jar-dot" />
          {fmtBank(profileRes.data?.jar_balance_cached ?? 0)}
        </a>
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }}>
        <div className="eyebrow">discover</div>
        <div className="display mt-4" style={{ fontSize: 28 }}>browse all topics</div>
        <div className="body mt-8" style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
          tap a topic to see courses you can add to your library.
        </div>

        {groups.map((g) => {
          const list = topicsByGroup.get(g.id) ?? [];
          if (list.length === 0) return null;
          return (
            <section
              key={g.id}
              className="mt-24"
              data-testid={`discover-group-${g.key ?? g.id}`}
            >
              <div
                className="eyebrow row"
                style={{ alignItems: 'center', gap: 8, fontSize: 13 }}
              >
                <LucideIcon name={g.icon} size={18} />
                <span>{g.title}</span>
              </div>
              <TopicGrid
                topics={list}
                importedByPresetId={importedByPresetId}
                courseCounts={courseCounts}
              />
            </section>
          );
        })}
      </div>
    </main>
  );
}
