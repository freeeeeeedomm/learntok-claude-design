// Onboarding — expanded animated mini-comic
// Scenes 1-5: fluid SVG animated storytelling
// Scenes 6-9: practical setup (meet duo, interests, rate, welcome)

// --- tiny hook for progressing animation time within a scene ---
const useTick = (active) => {
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    let raf, start;
    const loop = (ts) => { if (!start) start = ts; setT((ts - start) / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return t;
};

// --- Scene 1: phone glowing in dark bedroom, hand scrolling endlessly ---
const Scene1 = () => {
  const t = useTick(true);
  const scroll = ((t * 60) % 80);
  return (
    <svg viewBox="0 0 300 260" width="100%" style={{ maxWidth: 320 }}>
      <defs>
        <radialGradient id="s1glow" cx="0.5" cy="0.45" r="0.5">
          <stop offset="0%" stopColor="#e89a56" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#e89a56" stopOpacity="0"/>
        </radialGradient>
        <clipPath id="phoneClip"><rect x="108" y="60" width="84" height="150" rx="10"/></clipPath>
      </defs>
      {/* dark room */}
      <rect width="300" height="260" fill="#0a0806"/>
      {/* glow */}
      <ellipse cx="150" cy="130" rx="140" ry="100" fill="url(#s1glow)"/>
      {/* phone */}
      <rect x="104" y="56" width="92" height="158" rx="14" fill="#1a1610" stroke="#2e2720" strokeWidth="1.5"/>
      <rect x="108" y="60" width="84" height="150" rx="10" fill="#0c0a08"/>
      {/* scrolling feed content inside phone */}
      <g clipPath="url(#phoneClip)">
        <g transform={`translate(0, ${-scroll})`}>
          {[0,1,2,3,4,5,6,7,8,9].map(i => (
            <g key={i} transform={`translate(0, ${i*40})`}>
              <rect x="114" y={64 + i*40} width="72" height="34" rx="4" fill="#2a1f18"/>
              <rect x="118" y={70 + i*40} width="40" height="4" rx="1" fill="#6a5540"/>
              <rect x="118" y={78 + i*40} width="30" height="3" rx="1" fill="#3e3228"/>
              <circle cx="176" cy={84 + i*40} r="5" fill="#e89a56" opacity="0.4"/>
            </g>
          ))}
        </g>
      </g>
      {/* thumb */}
      <g>
        <ellipse cx="195" cy={180 + Math.sin(t*3) * 14} rx="22" ry="30" fill="#e4c4a0" stroke="#1a0e08" strokeWidth="1.4"/>
        <ellipse cx="195" cy={165 + Math.sin(t*3) * 14} rx="12" ry="14" fill="#e4c4a0" stroke="#1a0e08" strokeWidth="1.4"/>
        <path d="M185 155 Q 195 150 205 155" fill="none" stroke="#1a0e08" strokeWidth="1" opacity="0.4"/>
      </g>
      {/* time ticks */}
      <g opacity={Math.min(1, t/1.5)}>
        <text x="24" y="40" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#6a5540">23:14</text>
        <text x="24" y="60" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#8a6d50">23:47</text>
        <text x="24" y="80" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#b08a65" opacity={Math.min(1, (t-1)/1.5)}>00:22</text>
        <text x="24" y="100" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#d85a3e" opacity={Math.min(1, (t-2)/1.5)}>01:08</text>
      </g>
    </svg>
  );
};

// --- Scene 2: guilt — empty textbook, closed laptop, morning light ---
const Scene2 = () => {
  const t = useTick(true);
  const sink = Math.min(1, t / 1.5);
  return (
    <svg viewBox="0 0 300 260" width="100%" style={{ maxWidth: 320 }}>
      <rect width="300" height="260" fill="#1a1410"/>
      {/* desk */}
      <rect x="0" y="180" width="300" height="80" fill="#2a1f18"/>
      <line x1="0" y1="180" x2="300" y2="180" stroke="#3a2d20" strokeWidth="1"/>
      {/* window morning light */}
      <rect x="200" y="20" width="80" height="120" fill="#3a2d20" stroke="#4a3828" strokeWidth="1"/>
      <line x1="240" y1="20" x2="240" y2="140" stroke="#4a3828" strokeWidth="1"/>
      <line x1="200" y1="80" x2="280" y2="80" stroke="#4a3828" strokeWidth="1"/>
      <path d="M200 140 L 280 140 L 280 20 L 200 20 Z" fill="url(#sunlight)" opacity="0.6"/>
      <defs>
        <linearGradient id="sunlight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4c874"/>
          <stop offset="100%" stopColor="#f4c874" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* closed textbook */}
      <g transform={`translate(40, ${150 + sink * 8})`}>
        <rect x="0" y="8" width="90" height="20" rx="2" fill="#7a4a28" stroke="#1a0e08" strokeWidth="1.4"/>
        <rect x="2" y="0" width="88" height="10" rx="1" fill="#8a5a38" stroke="#1a0e08" strokeWidth="1.4"/>
        <rect x="8" y="3" width="60" height="2" fill="#4a2a18"/>
        <rect x="8" y="7" width="40" height="1.5" fill="#4a2a18"/>
      </g>
      {/* clock showing late morning */}
      <g transform="translate(140, 90)">
        <circle r="22" fill="#2a1f18" stroke="#6a5540" strokeWidth="1.5"/>
        <line x1="0" y1="0" x2="0" y2="-14" stroke="#d85a3e" strokeWidth="2" strokeLinecap="round"/>
        <line x1="0" y1="0" x2="10" y2="4" stroke="#e89a56" strokeWidth="1.5" strokeLinecap="round"/>
        <circle r="2" fill="#e89a56"/>
      </g>
      {/* sigh speech-bubble from offscreen */}
      <g opacity={sink} transform={`translate(160, ${60 - sink * 10})`}>
        <text fontFamily="Fraunces, serif" fontSize="22" fontStyle="italic" fill="#b8ad9a">…oof.</text>
      </g>
    </svg>
  );
};

// --- Scene 3: the loop visualization ---
const Scene3 = () => {
  const t = useTick(true);
  const angle = (t * 60) % 360;
  return (
    <svg viewBox="0 0 300 260" width="100%" style={{ maxWidth: 320 }}>
      <rect width="300" height="260" fill="#13110e"/>
      <g transform="translate(150, 130)">
        {/* outer loop arrows */}
        <circle r="80" fill="none" stroke="#2e2720" strokeWidth="2" strokeDasharray="4 6"/>
        <g transform={`rotate(${angle})`}>
          <polygon points="78,-6 88,0 78,6" fill="#d85a3e"/>
        </g>
        <g transform={`rotate(${angle + 180})`}>
          <polygon points="78,-6 88,0 78,6" fill="#d85a3e"/>
        </g>
        {/* 4 nodes */}
        {[
          { a: 0, l: 'open' },
          { a: 90, l: 'scroll' },
          { a: 180, l: 'lose time' },
          { a: 270, l: 'feel bad' },
        ].map((n, i) => {
          const rad = (n.a * Math.PI) / 180;
          const x = Math.cos(rad) * 80, y = Math.sin(rad) * 80;
          return (
            <g key={i} transform={`translate(${x}, ${y})`}>
              <circle r="20" fill="#1c1814" stroke="#d85a3e" strokeWidth="1.5"/>
              <text fontFamily="Inter, sans-serif" fontSize="10" fill="#f3ece0" textAnchor="middle" y="3">{n.l}</text>
            </g>
          );
        })}
        <text fontFamily="Fraunces, serif" fontSize="14" fill="#e89a56" textAnchor="middle" y="4" fontStyle="italic">the loop</text>
      </g>
    </svg>
  );
};

// --- Scene 4: breaking the loop — jar + video swap animation ---
const Scene4 = () => {
  const t = useTick(true);
  const phase = (t % 3) / 3; // 0..1 loop
  const bookX = 60 - phase * 20;
  const videoOpacity = Math.min(1, phase * 2);
  const jarFill = Math.min(1, phase * 1.2);
  return (
    <svg viewBox="0 0 300 260" width="100%" style={{ maxWidth: 320 }}>
      <rect width="300" height="260" fill="#13110e"/>
      {/* book on left */}
      <g transform={`translate(${bookX}, 100)`}>
        <rect x="0" y="0" width="70" height="60" rx="3" fill="#2a1f18" stroke="#6a5540" strokeWidth="1.4"/>
        <line x1="10" y1="14" x2="60" y2="14" stroke="#6a5540" strokeWidth="1.2"/>
        <line x1="10" y1="22" x2="60" y2="22" stroke="#6a5540" strokeWidth="1.2"/>
        <line x1="10" y1="30" x2="50" y2="30" stroke="#6a5540" strokeWidth="1.2"/>
        <text x="35" y="52" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#e89a56">learn</text>
      </g>
      {/* arrow + jar in middle */}
      <g transform="translate(130, 120)">
        <path d="M0 15 L 30 15 M 24 9 L 30 15 L 24 21" fill="none" stroke="#e89a56" strokeWidth="2" strokeLinecap="round"/>
      </g>
      {/* jar */}
      <g transform="translate(170, 80)">
        <path d="M10 20 L 10 100 Q 10 110 20 110 L 50 110 Q 60 110 60 100 L 60 20 Z" fill="none" stroke="#e89a56" strokeWidth="2"/>
        <path d="M8 18 L 62 18" stroke="#e89a56" strokeWidth="2" strokeLinecap="round"/>
        {/* fill */}
        <path d={`M10 ${110 - jarFill * 80} L 60 ${110 - jarFill * 80} L 60 100 Q 60 110 50 110 L 20 110 Q 10 110 10 100 Z`} fill="#e89a56" opacity="0.7"/>
      </g>
      {/* phone on right with video */}
      <g transform="translate(240, 100)" opacity={videoOpacity}>
        <rect x="0" y="0" width="40" height="70" rx="6" fill="#1a1610" stroke="#6a5540" strokeWidth="1.2"/>
        <rect x="3" y="3" width="34" height="64" rx="3" fill="#0c0a08"/>
        <polygon points="14,22 14,46 30,34" fill="#e89a56"/>
      </g>
      {/* caption */}
      <text x="150" y="230" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="18" fontStyle="italic" fill="#f3ece0">learn → earn → play</text>
    </svg>
  );
};

// --- Scene 5: two friends (silhouettes of Nibs & Angel from behind peeking in) ---
const Scene5 = () => {
  const t = useTick(true);
  const bob = Math.sin(t * 2) * 4;
  return (
    <svg viewBox="0 0 300 260" width="100%" style={{ maxWidth: 320 }}>
      <rect width="300" height="260" fill="#13110e"/>
      <text x="150" y="40" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#7a7062" letterSpacing="2">NOT ALONE</text>
      {/* silhouette of nibs rising from bottom-left */}
      <g transform={`translate(60, ${170 + bob})`}>
        <Nibs size={110} mood="happy" />
      </g>
      {/* angel from bottom-right */}
      <g transform={`translate(170, ${170 - bob})`}>
        <Angel size={110} mood="happy" />
      </g>
      <text x="150" y="245" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="18" fill="#f3ece0" fontStyle="italic">two little helpers</text>
    </svg>
  );
};

const ComicScene = ({ which }) => {
  if (which === 1) return <Scene1/>;
  if (which === 2) return <Scene2/>;
  if (which === 3) return <Scene3/>;
  if (which === 4) return <Scene4/>;
  if (which === 5) return <Scene5/>;
  return null;
};

const Onboarding = ({ onFinish, state, set }) => {
  const [i, setI] = React.useState(0);
  const next = () => setI(x => Math.min(x + 1, slides.length - 1));
  const skip = () => setI(5); // skip intro to meet duo

  const comic = (n, eyebrow, title, body, cta = 'next') => (
    <div className="col gap-8 pad" style={{ height: '100%' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>{eyebrow}</div>
      <div className="center" style={{ marginTop: 4, minHeight: 220 }}>
        <ComicScene which={n}/>
      </div>
      <div className="display" style={{ fontSize: 26 }}>{title}</div>
      <div className="body">{body}</div>
      <div className="mt-auto col gap-8">
        <button className="btn btn-primary" onClick={next}>{cta}</button>
        {n <= 2 && <button className="btn btn-ghost" onClick={skip}>skip intro</button>}
      </div>
    </div>
  );

  const slides = [
    // 1 — late night scroll
    comic(1, '01 · a familiar scene', 'it\'s 1am. again.',
      <>you opened it for "just five minutes." three hours ago. don't worry — you're not broken.</>),

    // 2 — morning regret
    comic(2, '02 · the morning after', 'that little ache.',
      <>the exam you didn't study for. the deadline you pushed. the "where did it go?" that won't quit.</>),

    // 3 — the loop
    comic(3, '03 · it\'s a loop', 'you\'re in a loop.',
      <>open → scroll → lose time → feel bad → open. infinite. designed that way on purpose.</>),

    // 4 — the idea
    comic(4, '04 · a different deal', 'what if scrolling had a price?',
      <>learn a little → <b style={{ color: 'var(--accent)' }}>earn</b> a little → watch a little. you still get the hit. you just pay for it with study time.</>),

    // 5 — meet them
    comic(5, '05 · you have help', 'you\'re not doing this alone.',
      <>two tiny characters live in the app. one tempts you toward fun. one pulls you back to focus. meet them next.</>,
      'meet them →'),

    // 6 — meet duo (full dialogue card)
    <div key="6" className="col gap-8 pad" style={{ height: '100%' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>06 · nibs &amp; the angel</div>
      <div className="row gap-8 mt-8" style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
        <div className="col aic" style={{ flex: 1 }}><Nibs size={120} mood="sly"/><div style={{ fontFamily: 'var(--serif)', fontSize: 18, marginTop: 6 }}>nibs</div></div>
        <div className="col aic" style={{ flex: 1 }}><Angel size={120}/><div style={{ fontFamily: 'var(--serif)', fontSize: 18, marginTop: 6 }}>the angel</div></div>
      </div>
      <div className="card mt-8" style={{ background: 'rgba(216,90,62,0.1)', borderColor: '#7a2218' }}>
        <div className="eyebrow" style={{ color: 'var(--nibs)' }}>nibs</div>
        <div className="body" style={{ color: 'var(--ink)', marginTop: 2 }}>"i'm the fun one. hold my handle at the bottom of any study page — i'll take you to the feed."</div>
      </div>
      <div className="card" style={{ background: 'rgba(244,200,116,0.06)', borderColor: '#6a5530' }}>
        <div className="eyebrow" style={{ color: 'var(--angel)' }}>the angel</div>
        <div className="body" style={{ color: 'var(--ink)', marginTop: 2 }}>"…and i'll bring you back. same gesture, bottom of the feed."</div>
      </div>
      <div className="mt-auto"><button className="btn btn-primary" onClick={next}>got it</button></div>
    </div>,

    // 7 — interests
    <div key="7" className="col gap-8 pad" style={{ height: '100%' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>07 · interests</div>
      <div className="display" style={{ fontSize: 28 }}>what are you into?</div>
      <div className="body">pick 3+ — we'll curate</div>
      <div className="row wrap gap-8 mt-12">
        {['web dev','design','languages','math','finance','history','psychology','cooking','music','science','philosophy','photography'].map(t => (
          <div key={t} className={`chip ${state.interests.includes(t) ? 'active' : ''}`}
               onClick={() => set(s => ({ ...s, interests: s.interests.includes(t) ? s.interests.filter(x=>x!==t) : [...s.interests, t] }))}>
            {t}
          </div>
        ))}
      </div>
      <div className="mt-auto">
        <button className="btn btn-primary" disabled={state.interests.length < 3} onClick={next}
          style={{ opacity: state.interests.length < 3 ? 0.5 : 1 }}>
          next {state.interests.length > 0 && `(${state.interests.length} picked)`}
        </button>
      </div>
    </div>,

    // 8 — rate
    <div key="8" className="col gap-8 pad" style={{ height: '100%' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>08 · your rate</div>
      <div className="display" style={{ fontSize: 26 }}>how much fun per minute studied?</div>
      <div className="card mt-12 col gap-12">
        <div className="row between aic">
          <span className="body" style={{ color: 'var(--ink)' }}>1 min learn</span>
          <span className="display" style={{ fontSize: 20, color: 'var(--accent)' }}>=</span>
          <span className="body" style={{ color: 'var(--ink)' }}>{state.rate} min play</span>
        </div>
        <input type="range" min="0.5" max="2" step="0.5" value={state.rate}
          onChange={e => set(s => ({ ...s, rate: parseFloat(e.target.value) }))}
          style={{ width: '100%', accentColor: 'var(--accent)' }} />
        <div className="row between" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)' }}>
          <span>2:1 stricter</span><span>1:1</span><span>1:2 generous</span>
        </div>
      </div>
      <div className="card" style={{ background: 'var(--bg-3)' }}>
        <div className="body"><b style={{ color: 'var(--ink)' }}>recommended:</b> 1:1 to start. change anytime.</div>
      </div>
      <div className="mt-auto"><button className="btn btn-primary" onClick={next}>almost done</button></div>
    </div>,

    // 9 — welcome
    <div key="9" className="col gap-12 pad tc" style={{ height: '100%', justifyContent: 'center' }}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>09 · ready</div>
      <div className="display" style={{ fontSize: 34 }}>welcome.</div>
      <div className="card mt-8" style={{ background: 'rgba(232,154,86,0.08)', borderColor: 'var(--accent)' }}>
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>welcome gift</div>
        <div className="display mt-4" style={{ fontSize: 28 }}>5 min in your jar</div>
        <div className="body mt-4">enough for one video. earn more by studying.</div>
      </div>
      <div className="body">nibs lives at the bottom of learning pages.<br/>the angel lives at the bottom of the feed.<br/>hold &amp; pull up to summon either.</div>
      <div className="mt-auto"><button className="btn btn-primary" onClick={onFinish}>start learning →</button></div>
    </div>,
  ];

  return (
    <div className="app fade-enter">
      {i > 0 && i < slides.length - 1 && (
        <button onClick={() => setI(x => x - 1)}
          style={{ position: 'absolute', top: 48, left: 16, zIndex: 10, width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--ink)', cursor: 'pointer', fontSize: 18 }}>‹</button>
      )}
      <div style={{ position: 'absolute', top: 52, left: 0, right: 0, display: 'flex', gap: 3, justifyContent: 'center', zIndex: 10 }}>
        {slides.map((_, idx) => (
          <div key={idx} style={{ width: idx === i ? 16 : 5, height: 4, borderRadius: 2, background: idx <= i ? 'var(--accent)' : 'var(--line)', transition: 'all 0.25s' }} />
        ))}
      </div>
      {slides[i]}
    </div>
  );
};

window.Onboarding = Onboarding;
