'use client';
import React from 'react';
import { Nibs } from '@/components/characters/Nibs';
import { Angel } from '@/components/characters/Angel';
import { ComicScene } from './Scenes';

const INTERESTS = [
  'web dev', 'design', 'languages', 'math', 'finance', 'history',
  'psychology', 'cooking', 'music', 'science', 'philosophy', 'photography',
];

type Props = {
  initialInterests: string[];
  initialRate: number;
  onFinish: (payload: { interests: string[]; rate: number }) => Promise<void> | void;
};

export function Onboarding({ initialInterests, initialRate, onFinish }: Props) {
  const [i, setI] = React.useState(0);
  const [interests, setInterests] = React.useState<string[]>(initialInterests);
  const [rate, setRate] = React.useState<number>(initialRate);
  const [submitting, setSubmitting] = React.useState(false);

  const toggleInterest = (t: string) =>
    setInterests((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onFinish({ interests, rate });
    } finally {
      setSubmitting(false);
    }
  };

  const slides: React.ReactNode[] = [];
  const next = () => setI((x) => Math.min(x + 1, slides.length - 1));
  const skip = () => setI(5);

  const comic = (
    n: 1 | 2 | 3 | 4 | 5,
    eyebrow: string,
    title: string,
    body: React.ReactNode,
    cta = 'next'
  ) => (
    <div className="col gap-8 pad" style={{ minHeight: '100vh' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>{eyebrow}</div>
      <div className="center" style={{ marginTop: 4, minHeight: 220 }}>
        <ComicScene which={n} />
      </div>
      <div className="display" style={{ fontSize: 26 }}>{title}</div>
      <div className="body">{body}</div>
      <div className="mt-auto col gap-8">
        <button className="btn btn-primary" onClick={next}>{cta}</button>
        {n <= 2 && <button className="btn btn-ghost" onClick={skip}>skip intro</button>}
      </div>
    </div>
  );

  slides.push(
    comic(1, '01 · a familiar scene', "it's 1am. again.",
      <>you opened it for &ldquo;just five minutes.&rdquo; three hours ago. don&rsquo;t worry — you&rsquo;re not broken.</>),
    comic(2, '02 · the morning after', 'that little ache.',
      <>the exam you didn&rsquo;t study for. the deadline you pushed. the &ldquo;where did it go?&rdquo; that won&rsquo;t quit.</>),
    comic(3, '03 · it\'s a loop', "you're in a loop.",
      <>open → scroll → lose time → feel bad → open. infinite. designed that way on purpose.</>),
    comic(4, '04 · a different deal', 'what if scrolling had a price?',
      <>learn a little → <b style={{ color: 'var(--accent)' }}>earn</b> a little → watch a little. you still get the hit. you just pay for it with study time.</>),
    comic(5, '05 · you have help', "you're not doing this alone.",
      <>two tiny characters live in the app. one tempts you toward fun. one pulls you back to focus. meet them next.</>,
      'meet them →'),
    <div key="6" className="col gap-8 pad" style={{ minHeight: '100vh' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>06 · nibs &amp; the angel</div>
      <div className="row gap-8 mt-8" style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
        <div className="col aic" style={{ flex: 1 }}>
          <Nibs size={120} mood="sly" />
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, marginTop: 6 }}>nibs</div>
        </div>
        <div className="col aic" style={{ flex: 1 }}>
          <Angel size={120} />
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, marginTop: 6 }}>the angel</div>
        </div>
      </div>
      <div className="card mt-8" style={{ background: 'rgba(216,90,62,0.1)', borderColor: '#7a2218' }}>
        <div className="eyebrow" style={{ color: 'var(--nibs)' }}>nibs</div>
        <div className="body" style={{ color: 'var(--ink)', marginTop: 2 }}>
          &ldquo;i&rsquo;m the fun one. hold my handle at the bottom of any study page — i&rsquo;ll take you to the feed.&rdquo;
        </div>
      </div>
      <div className="card" style={{ background: 'rgba(244,200,116,0.06)', borderColor: '#6a5530' }}>
        <div className="eyebrow" style={{ color: 'var(--angel)' }}>the angel</div>
        <div className="body" style={{ color: 'var(--ink)', marginTop: 2 }}>
          &ldquo;…and i&rsquo;ll bring you back. same gesture, bottom of the feed.&rdquo;
        </div>
      </div>
      <div className="mt-auto"><button className="btn btn-primary" onClick={next}>got it</button></div>
    </div>,
    <div key="7" className="col gap-8 pad" style={{ minHeight: '100vh' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>07 · interests</div>
      <div className="display" style={{ fontSize: 28 }}>what are you into?</div>
      <div className="body">pick 3+ — we&rsquo;ll curate</div>
      <div className="row wrap gap-8 mt-12">
        {INTERESTS.map((t) => (
          <div
            key={t}
            className={`chip ${interests.includes(t) ? 'active' : ''}`}
            onClick={() => toggleInterest(t)}
          >
            {t}
          </div>
        ))}
      </div>
      <div className="mt-auto">
        <button
          className="btn btn-primary"
          disabled={interests.length < 3}
          onClick={next}
          style={{ opacity: interests.length < 3 ? 0.5 : 1 }}
        >
          next {interests.length > 0 && `(${interests.length} picked)`}
        </button>
      </div>
    </div>,
    <div key="8" className="col gap-8 pad" style={{ minHeight: '100vh' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>08 · your rate</div>
      <div className="display" style={{ fontSize: 26 }}>how much fun per minute studied?</div>
      <div className="card mt-12 col gap-12">
        <div className="row between aic">
          <span className="body" style={{ color: 'var(--ink)' }}>1 min learn</span>
          <span className="display" style={{ fontSize: 20, color: 'var(--accent)' }}>=</span>
          <span className="body" style={{ color: 'var(--ink)' }}>{rate} min play</span>
        </div>
        <input
          type="range" min="0.5" max="2" step="0.5" value={rate}
          onChange={(e) => setRate(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
        <div className="row between" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)' }}>
          <span>2:1 stricter</span><span>1:1</span><span>1:2 generous</span>
        </div>
      </div>
      <div className="card" style={{ background: 'var(--bg-3)' }}>
        <div className="body"><b style={{ color: 'var(--ink)' }}>recommended:</b> 1:1 to start. change anytime.</div>
      </div>
      <div className="mt-auto"><button className="btn btn-primary" onClick={next}>almost done</button></div>
    </div>,
    <div key="9" className="col gap-12 pad tc" style={{ minHeight: '100vh', justifyContent: 'center' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>09 · ready</div>
      <div className="display" style={{ fontSize: 34 }}>welcome.</div>
      <div className="card mt-8" style={{ background: 'rgba(232,154,86,0.08)', borderColor: 'var(--accent)' }}>
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>welcome gift</div>
        <div className="display mt-4" style={{ fontSize: 28 }}>5 min in your jar</div>
        <div className="body mt-4">enough for one video. earn more by studying.</div>
      </div>
      <div className="body">
        nibs lives at the bottom of learning pages.<br />
        the angel lives at the bottom of the feed.<br />
        hold &amp; pull up to summon either.
      </div>
      <div className="mt-auto">
        <button className="btn btn-primary" onClick={finish} disabled={submitting}>
          {submitting ? 'starting…' : 'start learning →'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="app fade-enter">
      {i > 0 && i < slides.length - 1 && (
        <button
          onClick={() => setI((x) => x - 1)}
          style={{
            position: 'absolute', top: 48, left: 16, zIndex: 10,
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            color: 'var(--ink)', cursor: 'pointer', fontSize: 18,
          }}
        >‹</button>
      )}
      <div
        style={{
          position: 'absolute', top: 52, left: 0, right: 0,
          display: 'flex', gap: 3, justifyContent: 'center', zIndex: 10,
        }}
      >
        {slides.map((_, idx) => (
          <div
            key={idx}
            style={{
              width: idx === i ? 16 : 5, height: 4, borderRadius: 2,
              background: idx <= i ? 'var(--accent)' : 'var(--line)',
              transition: 'all 0.25s',
            }}
          />
        ))}
      </div>
      {slides[i]}
    </div>
  );
}
