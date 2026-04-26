'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type ParsedVideo = {
  ytId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSeconds: number;
  source: 'data-api' | 'oembed';
};

export function AddForm() {
  const [url, setUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedVideo | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const parse = async () => {
    if (parsing || !url.trim()) return;
    setParsing(true);
    setError(null);
    setParsed(null);
    try {
      const res = await fetch(
        `/api/youtube/parse?url=${encodeURIComponent(url.trim())}`
      );
      const body = await res.json();
      if (!res.ok) {
        setError(
          body.error === 'not_youtube'
            ? "that doesn't look like a youtube link."
            : body.error === 'bad_url'
              ? 'not a valid url.'
              : 'couldn’t reach youtube — try again.'
        );
        return;
      }
      setParsed(body as ParsedVideo);
      setCustomTitle((body as ParsedVideo).title);
    } catch {
      setError('network hiccup — try again');
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!parsed || saving) return;
    const title = customTitle.trim() || parsed.title;
    if (!title) {
      setError('title is required');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('not signed in');
        setSaving(false);
        return;
      }

      // Insert course owned by this user.
      // (legacy `topic` text column dropped in migration 0009; topic_id is
      // intentionally null here — user-pasted videos don't belong to a topic
      // until the user organizes them.)
      const { data: courseRow, error: courseErr } = await supabase
        .from('courses')
        .insert({
          owner_id: user.id,
          is_preset: false,
          title,
          icon: '🎥',
        })
        .select('id')
        .single();
      if (courseErr || !courseRow) {
        setError(courseErr?.message ?? 'could not create course');
        setSaving(false);
        return;
      }

      // Insert single lesson.
      const { error: lessonErr } = await supabase.from('lessons').insert({
        course_id: courseRow.id,
        position: 1,
        title,
        yt_id: parsed.ytId,
        duration_seconds: parsed.durationSeconds,
      });
      if (lessonErr) {
        // Best-effort: leave the empty course behind rather than attempt a rollback.
        setError(lessonErr.message);
        setSaving(false);
        return;
      }

      // Add the new course to the user's shelf so it shows on /home.
      // (Resolves the "/add doesn't write profile_courses" deferral from
      // PR #19.) Note: until a future PR adds an "ungrouped" rail or a
      // topic-assignment UI, the course won't render under any rail
      // because topic_id is null — but it IS on the shelf.
      const { data: shelfTop } = await supabase
        .from('profile_courses')
        .select('position')
        .eq('user_id', user.id)
        .order('position', { ascending: false })
        .limit(1);
      const nextPos = (shelfTop?.[0]?.position ?? -1) + 1;

      const { error: shelfErr } = await supabase
        .from('profile_courses')
        .insert({
          user_id: user.id,
          course_id: courseRow.id,
          position: nextPos,
        });
      if (shelfErr) {
        setError(`saved course but couldn't add to shelf: ${shelfErr.message}`);
        setSaving(false);
        return;
      }

      router.push(`/course/${courseRow.id}`);
    } catch (e) {
      setError((e as Error).message ?? 'something went wrong');
      setSaving(false);
    }
  };

  return (
    <>
      <div className="col gap-8">
        <input
          type="url"
          inputMode="url"
          placeholder="https://youtube.com/..."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setParsed(null);
            setError(null);
          }}
          className="w-full bg-bg-2 border border-line rounded-xl px-4 py-3 text-ink"
          style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
          data-testid="add-url-input"
        />
        {!parsed && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={parse}
            disabled={parsing || !url.trim()}
            data-testid="add-parse"
          >
            {parsing ? 'parsing…' : 'look it up'}
          </button>
        )}
      </div>

      {error && (
        <div
          className="card"
          style={{
            background: 'rgba(217, 111, 61, 0.08)',
            borderColor: 'var(--bad)',
          }}
          data-testid="add-error"
        >
          <div className="body" style={{ color: 'var(--bad)' }}>
            {error}
          </div>
        </div>
      )}

      {parsed && (
        <>
          <div className="card col gap-8" data-testid="add-preview">
            {parsed.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={parsed.thumbnail}
                alt=""
                style={{ width: '100%', borderRadius: 8, objectFit: 'cover' }}
              />
            )}
            <div className="eyebrow">{parsed.channel || 'youtube'}</div>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-ink"
              data-testid="add-title"
            />
            <div
              className="body"
              style={{ fontSize: 11, color: 'var(--ink-mute)' }}
            >
              {parsed.source === 'oembed'
                ? 'duration unknown (youtube data api key not configured — showing bare metadata).'
                : `${Math.floor(parsed.durationSeconds / 60)} min`}
            </div>
          </div>

          <div className="mt-auto col gap-8">
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={saving}
              data-testid="add-save"
            >
              {saving ? 'saving…' : 'save to library'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setParsed(null);
                setError(null);
                setCustomTitle('');
              }}
              disabled={saving}
            >
              try a different link
            </button>
          </div>
        </>
      )}

      <div
        className="body"
        style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 'auto' }}
      >
        single videos only for now. playlist support comes with a real youtube api key.
      </div>
    </>
  );
}
