import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LessonPlayer } from './LessonPlayer';

type Params = { params: { id: string } };

export default async function LessonPage({ params }: Params) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: lesson } = await supabase
    .from('lessons')
    .select(`
      id, title, yt_id, position,
      course:courses!inner ( id, title )
    `)
    .eq('id', params.id)
    .maybeSingle();
  if (!lesson) redirect('/home');

  // `course` comes back as an array from the !inner join in supabase-js v2.
  const course = Array.isArray(lesson.course) ? lesson.course[0] : lesson.course;

  const { count: courseLessonCount } = await supabase
    .from('lessons')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', course.id);

  const { data: profile } = await supabase
    .from('profiles')
    .select('jar_balance_cached')
    .eq('id', user.id)
    .single();

  const { data: progress } = await supabase
    .from('lesson_progress')
    .select('completed_at')
    .eq('user_id', user.id)
    .eq('lesson_id', params.id)
    .maybeSingle();

  return (
    <LessonPlayer
      lesson={{
        id: lesson.id,
        title: lesson.title,
        ytId: lesson.yt_id,
        position: lesson.position,
        courseTitle: course.title,
        courseLessonCount: courseLessonCount ?? 0,
      }}
      initialBalance={profile?.jar_balance_cached ?? 0}
      alreadyCompleted={!!progress?.completed_at}
    />
  );
}
