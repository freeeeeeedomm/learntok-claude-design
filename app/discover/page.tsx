import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtBank } from '@/lib/format';

export default async function DiscoverPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [profileRes, groupsRes, topicsRes, shelfRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('jar_balance_cached')
      .eq('id', user.id)
      .single(),
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
    // Join via courses to attribute each shelf row to a topic. Used to render
    // a small "N in library" badge on each topic chip.
    supabase
      .from('profile_courses')
      .select('course_id, courses!inner(topic_id)')
      .eq('user_id', user.id),
  ]);

  const groups = groupsRes.data ?? [];
  const topics = topicsRes.data ?? [];

  type ShelfRow = { course_id: string; courses: { topic_id: string | null } };
  const shelfTopicCounts = new Map<string, number>();
  for (const row of (shelfRes.data ?? []) as unknown as ShelfRow[]) {
    const tid = row.courses?.topic_id;
    if (!tid) continue;
    shelfTopicCounts.set(tid, (shelfTopicCounts.get(tid) ?? 0) + 1);
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
        <a
          href="/progress"
          className="jar-chip"
          data-testid="discover-jar-chip"
        >
          <span className="jar-dot" />
          {fmtBank(profileRes.data?.jar_balance_cached ?? 0)}
        </a>
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }}>
        <div className="eyebrow">discover</div>
        <div className="display mt-4" style={{ fontSize: 28 }}>
          browse all topics
        </div>
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
              <div className="eyebrow" style={{ fontSize: 13 }}>
                {g.icon ?? ''} {g.title}
              </div>
              <div
                className="row mt-8"
                style={{ flexWrap: 'wrap', gap: 8 }}
              >
                {list.map((t) => {
                  const count = shelfTopicCounts.get(t.id) ?? 0;
                  return (
                    <a
                      key={t.id}
                      href={`/discover/topic/${t.id}`}
                      data-testid={`discover-topic-${t.id}`}
                      style={{
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: 'var(--bg-2)',
                        border: '1px solid var(--line)',
                        color: 'var(--ink)',
                        textDecoration: 'none',
                        fontFamily: 'var(--serif)',
                        fontSize: 14,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{t.icon ?? '•'}</span>
                      <span>{t.title}</span>
                      {count > 0 && (
                        <span
                          style={{
                            marginLeft: 4,
                            fontFamily: 'var(--mono)',
                            fontSize: 10,
                            color: 'var(--accent)',
                          }}
                          data-testid={`discover-topic-${t.id}-count`}
                        >
                          · {count} in library
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
