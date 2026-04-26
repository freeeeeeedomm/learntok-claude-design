'use client';
import React from 'react';
import { RestSlider } from './RestSlider';

type GroupLite = {
  key: string;
  title: string;
  icon: string | null;
  topicCount: number;
};

type Props = {
  groups: GroupLite[];
  initialRestMinutes: number;
  onFinish: (payload: { rate: number; groupKeys: string[] }) => Promise<void> | void;
};

export function Onboarding({ groups, initialRestMinutes, onFinish }: Props) {
  const [step, setStep] = React.useState<0 | 1>(0);
  const [restMin, setRestMin] = React.useState<number>(initialRestMinutes);
  // No initial pick — group selection has no legacy field to recover from.
  const [picked, setPicked] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  const togglePick = (key: string) =>
    setPicked((xs) => (xs.includes(key) ? xs.filter((x) => x !== key) : [...xs, key]));

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onFinish({ rate: restMin / 60, groupKeys: picked });
    } catch (e) {
      // Server actions use a thrown error (digest "NEXT_REDIRECT...") to
      // navigate. Re-throw so Next.js can handle it.
      const err = e as Error & { digest?: string };
      if (err?.digest?.startsWith('NEXT_REDIRECT')) throw e;
      setSubmitting(false);
      // Surface failure so the user can retry.
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
          restMin={restMin}
          onChange={setRestMin}
          onNext={() => setStep(1)}
        />
      ) : (
        <PageGroups
          groups={groups}
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
  restMin,
  onChange,
  onNext,
}: {
  restMin: number;
  onChange: (n: number) => void;
  onNext: () => void;
}) {
  return (
    <div className="col gap-8 pad" style={{ minHeight: '100vh' }} data-testid="onboarding-page-deal">
      <div className="eyebrow" style={{ color: 'var(--accent)', marginTop: 80 }}>
        01 · the deal
      </div>

      <div className="display" style={{ fontSize: 28, marginTop: 12 }}>
        Earn your scroll<br />time by learning.
      </div>

      <div className="card mt-16">
        <RestSlider restMin={restMin} onChange={onChange} />
        <div className="body" style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 12 }}>
          you can adjust this later in profile.
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

function PageGroups({
  groups,
  picked,
  onToggle,
  onSubmit,
  submitting,
}: {
  groups: GroupLite[];
  picked: string[];
  onToggle: (key: string) => void;
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
        {groups.map((g) => {
          const isOn = picked.includes(g.key);
          return (
            <button
              key={g.key}
              type="button"
              aria-pressed={isOn}
              onClick={() => onToggle(g.key)}
              data-testid={`group-tile-${g.key}`}
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
              <span style={{ fontSize: 22 }}>{g.icon ?? '•'}</span>
              <span className="col" style={{ gap: 2 }}>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>
                  {g.title}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--ink-mute)',
                  }}
                  data-testid={`group-tile-${g.key}-subtitle`}
                >
                  {g.title} · {g.topicCount} subjects
                </span>
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
        you can browse the full catalog later.
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
