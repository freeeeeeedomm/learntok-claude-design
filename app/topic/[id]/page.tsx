import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopicCourseSection } from '@/components/topic/TopicCourseSection';

function fmtBank(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
}

export default async function TopicPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('jar_balance_cached, onboarded')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarded) redirect('/onboarding');

  // Extended select picks up `owner_id` + `is_preset` so the client
  // section can hide owner-only affordances (Add course, Organize, ⋯
  // menu) on preset topics. Library-personalize design § "Behaviors":
  // user-owned topic pages have CRUD; preset topic pages stay read-only
  // until the user imports the topic via the Discover Add-to-home flow
  // (PR-E).
  const { data: topic } = await supabase
    .from('topics')
    .select('id, title, icon, color, owner_id, is_preset')
    .eq('id', params.id)
    .single();
  if (!topic) notFound();

  const ownsTopic = topic.owner_id === user.id;

  const { data: coursesData } = await supabase
    .from('courses')
    .select('id, title, icon, position')
    .eq('topic_id', params.id)
    .order('position', { ascending: true });

  const courses = coursesData ?? [];

  return (
    <main className="app">
      <div className="topbar">
        <a href="/home" className="back" data-testid="topic-back">
          ‹
        </a>
        <div className="eyebrow">
          {topic.icon} {topic.title}
        </div>
        <a
          href="/progress"
          className="jar-chip"
          data-testid="topic-jar-chip"
        >
          <span className="jar-dot" />
          {fmtBank(profile?.jar_balance_cached ?? 0)}
        </a>
      </div>

      <div className="pad pad-top" style={{ paddingTop: 80 }}>
        <div className="display" style={{ fontSize: 28 }}>
          {topic.title}
        </div>
        <div className="body mt-4" style={{ fontSize: 13 }}>
          {courses.length} course{courses.length === 1 ? '' : 's'}
        </div>

        <TopicCourseSection
          topicId={topic.id}
          ownsTopic={ownsTopic}
          courses={courses.map((c) => ({
            id: c.id,
            title: c.title,
            icon: c.icon,
          }))}
        />

        {courses.length === 0 && !ownsTopic && (
          <div className="card mt-16" data-testid="topic-empty">
            <div className="body">no courses yet under this topic.</div>
          </div>
        )}
      </div>
    </main>
  );
}
