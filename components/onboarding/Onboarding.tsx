'use client';
import React from 'react';

type TopicLite = {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
};

type Props = {
  topics: TopicLite[];
  initialLearnMinutes: number;       // derived in page.tsx from profile.rate
  initialTopicIds: string[];          // existing topic UUIDs in profile.interests
  onFinish: (payload: { rate: number; topicIds: string[] }) => Promise<void> | void;
};

const LEARN_MIN = 10;
const LEARN_MAX = 60;
const LEARN_STEP = 5;

function moodLabel(learnMin: number): string {
  if (learnMin <= 10) return 'easygoing';
  if (learnMin <= 25) return 'balanced';
  if (learnMin <= 45) return 'focused';
  return 'monk mode';
}

export function Onboarding({ topics, initialLearnMinutes, initialTopicIds, onFinish }: Props) {
  const [step, setStep] = React.useState<0 | 1>(0);
  const [learnMin, setLearnMin] = React.useState<number>(initialLearnMinutes);
  const [picked, setPicked] = React.useState<string[]>(initialTopicIds);
  const [submitting, setSubmitting] = React.useState(false);

  const togglePick = (id: string) =>
    setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onFinish({ rate: 5 / learnMin, topicIds: picked });
    } catch (e) {
      // Server actions use a thrown error (digest "NEXT_REDIRECT...") to
      // navigate. Re-throw so Next.js can handle it.
      const err = e as Error & { digest?: string };
      if (err?.digest?.startsWith('NEXT_REDIRECT')) throw e;
      setSubmitting(false);
      // Surface the failure so the user can retry. A toast system would be
      // nicer; alert() is fine for v1 because this only fires on auth/RLS
      // failures or network errors that the user must act on.
      alert(err.message ?? 'submit_failed');
    }
  };

  return (
    <div className="app fade-enter" data-testid="onboarding-root">
      {/* Progress dots (2 dots since 2 steps) */}
      <div
        style={{
          position: 'absolute', top: 52, left: 0, right: 0,
          display: 'flex', gap: 4, justifyContent: 'center', zIndex: 10,
        }}
      >
        {[0, 1].map((idx) => (
          <div
            key={idx}
            style={{
              width: idx === step ? 18 : 6,
              height: 4,
              borderRadius: 2,
              background: idx <= step ? 'var(--accent)' : 'var(--line)',
              transition: 'all 0.25s',
            }}
          />
        ))}
      </div>

      {/* Back button on step 2 */}
      {step === 1 && (
        <button
          type="button"
          onClick={() => setStep(0)}
          aria-label="back"
          style={{
            position: 'absolute', top: 48, left: 16, zIndex: 10,
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            color: 'var(--ink)', cursor: 'pointer', fontSize: 18,
          }}
        >‹</button>
      )}

      {step === 0 ? (
        <PageDeal
          learnMin={learnMin}
          onChange={setLearnMin}
          onNext={() => setStep(1)}
        />
      ) : (
        <PageTopics
          topics={topics}
          picked={picked}
          onToggle={togglePick}
          onSubmit={submit}
          submitting={submitting}
        />
      )}
    </div>
  );
}

function PageDeal({
  learnMin,
  onChange,
  onNext,
}: {
  learnMin: number;
  onChange: (n: number) => void;
  onNext: () => void;
}) {
  return (
    <div className="col gap-8 pad" style={{ minHeight: '100vh' }} data-testid="onboarding-page-deal">
      <div className="eyebrow" style={{ color: 'var(--accent)', marginTop: 80 }}>
        01 · the deal
      </div>

      <div className="display" style={{ fontSize: 28, marginTop: 12 }}>
        Earn your guilty-free<br />scroll time by learning.
      </div>

      <div className="card mt-16 col gap-12">
        <div className="row between aic">
          <span className="body" style={{ color: 'var(--ink)' }}>Learn</span>
          <span
            className="display"
            style={{ fontSize: 28, color: 'var(--accent)' }}
            data-testid="deal-learn-min"
          >
            {learnMin} min
          </span>
        </div>
        <div className="row between aic">
          <span className="body" style={{ color: 'var(--ink)' }}>Scroll</span>
          <span className="display" style={{ fontSize: 22 }}>5 min</span>
        </div>

        <input
          type="range"
          min={LEARN_MIN}
          max={LEARN_MAX}
          step={LEARN_STEP}
          value={learnMin}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
          data-testid="deal-slider"
        />

        <div
          className="row"
          style={{
            justifyContent: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ink-mute)',
          }}
          data-testid="deal-mood"
        >
          {moodLabel(learnMin)}
        </div>

        <div className="body" style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
          you can change this anytime.
        </div>
      </div>

      <div className="mt-auto">
        <button
          className="btn btn-primary"
          onClick={onNext}
          data-testid="deal-cta"
        >
          sounds fair →
        </button>
      </div>
    </div>
  );
}

function PageTopics({
  topics,
  picked,
  onToggle,
  onSubmit,
  submitting,
}: {
  topics: TopicLite[];
  picked: string[];
  onToggle: (id: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const ctaText =
    picked.length === 0
      ? 'skip for now →'
      : `continue (${picked.length} picked) →`;

  return (
    <div className="col gap-8 pad" style={{ minHeight: '100vh' }} data-testid="onboarding-page-topics">
      <div className="eyebrow" style={{ color: 'var(--accent)', marginTop: 80 }}>
        02 · pick what catches your eye
      </div>

      <div className="display" style={{ fontSize: 28, marginTop: 12 }}>
        What sounds interesting?
      </div>

      <div className="col gap-8 mt-16">
        {topics.map((t) => {
          const isOn = picked.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={isOn}
              onClick={() => onToggle(t.id)}
              data-testid={`topic-tile-${t.id}`}
              data-selected={isOn ? 'true' : 'false'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 14,
                border: `1px solid ${isOn ? 'var(--accent)' : 'var(--line)'}`,
                background: isOn ? 'var(--bg-3, var(--bg-2))' : 'var(--bg-2)',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--ink)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* left-edge color bar — only when selected */}
              {isOn && t.color && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    background: t.color,
                  }}
                />
              )}
              <span style={{ fontSize: 20, marginLeft: isOn && t.color ? 6 : 0 }}>
                {t.icon ?? '•'}
              </span>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>
                {t.title}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="body mt-12"
        style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center' }}
      >
        pick any number — none is fine too.<br />
        you can add topics or paste a YouTube link later.
      </div>

      <div className="mt-auto">
        <button
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={submitting}
          data-testid="topics-cta"
        >
          {submitting ? 'starting…' : ctaText}
        </button>
      </div>
    </div>
  );
}
