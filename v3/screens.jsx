// Main app screens (Home, Course, Lesson, Feed, Budget, Progress)
const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60); const s = sec % 60;
  return `${m}:${s.toString().padStart(2,'0')}`;
};
const fmtBank = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60); const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
};

// ------- HOME -------
const Home = ({ state, set, goto }) => {
  const current = state.courses.find(c => c.lessons.some(l => !l.done));
  const nextLesson = current && current.lessons.find(l => !l.done);

  return (
    <div className="app scroll">
      <div className="pad">
        <div className="row between aic">
          <div>
            <div className="eyebrow">{new Date().toLocaleDateString('en', { weekday: 'long' }).toLowerCase()} · 🔥 {state.streak}</div>
            <div className="display mt-4" style={{ fontSize: 30 }}>hey, sam</div>
          </div>
          <div className="jar-chip" onClick={() => goto('progress')}>
            <div className="jar-dot"/>{fmtBank(state.bank)}
          </div>
        </div>

        {current && (
          <div className="card card-hl mt-16" onClick={() => goto('lesson', { courseId: current.id, lessonId: nextLesson.id })}>
            <div className="eyebrow">continue</div>
            <div className="display mt-4" style={{ fontSize: 22 }}>{current.title}</div>
            <div className="bar mt-12"><i style={{ width: (current.lessons.filter(l=>l.done).length / current.lessons.length * 100) + '%' }}/></div>
            <div className="body mt-8" style={{ fontSize: 12 }}>up next · {nextLesson.title} · {Math.floor(nextLesson.dur/60)}m</div>
          </div>
        )}

        <div className="eyebrow mt-24">your topics</div>
        <div className="col gap-8 mt-8">
          {state.courses.map(c => {
            const done = c.lessons.filter(l => l.done).length;
            return (
              <div key={c.id} className="lesson-row" onClick={() => goto('course', { courseId: c.id })}>
                <div className="thumb">{c.icon}</div>
                <div className="grow col">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</div>
                  <div className="body" style={{ fontSize: 11 }}>{done}/{c.lessons.length} lessons · {c.topic}</div>
                </div>
                <div style={{ color: 'var(--ink-mute)' }}>›</div>
              </div>
            );
          })}
          <div className="lesson-row" style={{ borderStyle: 'dashed', justifyContent: 'center', color: 'var(--ink-soft)' }}
               onClick={() => goto('add')}>
            <span style={{ fontSize: 18 }}>+</span> paste YouTube link
          </div>
        </div>
      </div>
      <NibsHandle onSummon={() => goto('nibs-ask')} />
    </div>
  );
};

// ------- COURSE DETAIL -------
const Course = ({ courseId, state, goto }) => {
  const c = state.courses.find(x => x.id === courseId);
  if (!c) return null;
  const done = c.lessons.filter(l => l.done).length;
  return (
    <div className="app scroll">
      <div className="topbar">
        <div className="back" onClick={() => goto('home')}>‹</div>
        <div className="jar-chip"><div className="jar-dot"/>{fmtBank(state.bank)}</div>
      </div>
      <div className="pad pad-top" style={{ paddingTop: 100 }}>
        <div className="eyebrow">{c.topic}</div>
        <div className="display mt-4" style={{ fontSize: 28 }}>{c.title}</div>
        <div className="body mt-4" style={{ fontSize: 12 }}>{c.lessons.length} lessons · {done}/{c.lessons.length} done</div>
        <div className="bar mt-12"><i style={{ width: (done / c.lessons.length * 100) + '%' }}/></div>

        <div className="col gap-8 mt-24">
          {c.lessons.map((l, i) => {
            const isCurrent = !l.done && c.lessons.slice(0, i).every(x => x.done);
            return (
              <div key={l.id} className={`lesson-row ${l.done ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
                   onClick={() => goto('lesson', { courseId: c.id, lessonId: l.id })}>
                <div className={`check-circle ${l.done ? 'done' : isCurrent ? 'current' : ''}`}>
                  {l.done ? '✓' : isCurrent ? '▶' : ''}
                </div>
                <div className="grow col">
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{l.title}</div>
                  <div className="body" style={{ fontSize: 11 }}>{Math.floor(l.dur/60)} min</div>
                </div>
                <div className="thumb">YT</div>
              </div>
            );
          })}
        </div>
      </div>
      <NibsHandle onSummon={() => goto('nibs-ask')} />
    </div>
  );
};

// ------- LESSON PLAYER (with YT + ticking timer) -------
const Lesson = ({ courseId, lessonId, state, set, goto }) => {
  const c = state.courses.find(x => x.id === courseId);
  const l = c && c.lessons.find(x => x.id === lessonId);
  const [playing, setPlaying] = React.useState(false);
  const [idle, setIdle] = React.useState(0); // seconds paused
  const [showIdle, setShowIdle] = React.useState(false);
  const [showTimer, setShowTimer] = React.useState(state.showTimer);

  // YT iframe API communication via postMessage (no SDK)
  const iframeRef = React.useRef(null);
  const onIframeLoad = () => {
    try {
      iframeRef.current.contentWindow.postMessage('{"event":"listening","id":1}', '*');
    } catch (e) {}
  };

  React.useEffect(() => {
    const onMsg = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        const d = JSON.parse(e.data);
        if (d.event === 'infoDelivery' && d.info && d.info.playerState !== undefined) {
          setPlaying(d.info.playerState === 1);
        }
      } catch {}
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Tick: credit bank while playing, track idle while paused
  React.useEffect(() => {
    const t = setInterval(() => {
      if (playing) {
        set(s => ({ ...s, bank: s.bank + 1, earnedToday: s.earnedToday + 1 }));
        setIdle(0);
      } else {
        setIdle(i => {
          const next = i + 1;
          if (next === 300 && !showIdle) setShowIdle(true); // 5 min
          return next;
        });
      }
    }, 1000);
    return () => clearInterval(t);
  }, [playing, showIdle, set]);

  if (!l) return null;

  const markDone = () => {
    set(s => {
      const cs = s.courses.map(co => co.id !== c.id ? co : ({
        ...co,
        lessons: co.lessons.map(ll => ll.id !== l.id ? ll : ({ ...ll, done: true }))
      }));
      return { ...s, courses: cs };
    });
    goto('lesson-done', { courseId, lessonId });
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="back" onClick={() => goto('course', { courseId })}>‹</div>
        <div className="row gap-8 aic">
          {showTimer && <div className="jar-chip"><div className="jar-dot"/>{fmtBank(state.bank)}</div>}
          <div className="btn-sm chip" style={{ padding: '4px 10px', fontSize: 11 }}
               onClick={() => { setShowTimer(!showTimer); set(s => ({ ...s, showTimer: !showTimer })); }}>
            {showTimer ? '👁 on' : '👁 off'}
          </div>
        </div>
      </div>

      <div className="pad pad-top col" style={{ paddingTop: 100, height: '100%' }}>
        <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
          <iframe ref={iframeRef} onLoad={onIframeLoad}
            src={`https://www.youtube.com/embed/${l.ytId}?enablejsapi=1&rel=0&modestbranding=1`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow="autoplay; encrypted-media" />
        </div>
        <div className="mt-16">
          <div className="eyebrow">{c.title} · {c.lessons.findIndex(x=>x.id===l.id)+1}/{c.lessons.length}</div>
          <div className="display mt-4" style={{ fontSize: 20 }}>{l.title}</div>
          <div className="body mt-4" style={{ fontSize: 12 }}>
            {playing ? <span style={{ color: 'var(--good)' }}>● earning time</span> : <span style={{ color: 'var(--ink-mute)' }}>paused · timer stopped</span>}
          </div>
        </div>

        <div className="col gap-8 mt-auto">
          <button className="btn btn-primary" onClick={markDone}>mark done & next</button>
        </div>
      </div>
      <NibsHandle onSummon={() => goto('nibs-ask')} />

      {showIdle && (
        <div className="sheet-backdrop">
          <div className="sheet">
            <div className="sheet-handle"/>
            <div className="display" style={{ fontSize: 24 }}>still studying?</div>
            <div className="body mt-8">video's been paused 5 min. we paused the earn clock too — no cheating by accident 😊</div>
            <div className="col gap-8 mt-16">
              <button className="btn btn-primary" onClick={() => { setShowIdle(false); setIdle(0); }}>yep, resume</button>
              <button className="btn btn-ghost" onClick={() => { setShowIdle(false); goto('home'); }}>done for now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ------- LESSON DONE CELEBRATION -------
const LessonDone = ({ courseId, lessonId, state, goto }) => {
  const c = state.courses.find(x => x.id === courseId);
  const l = c && c.lessons.find(x => x.id === lessonId);
  if (!l) return null;
  const idx = c.lessons.findIndex(x => x.id === l.id);
  const next = c.lessons[idx + 1];
  return (
    <div className="app">
      <div className="pad col tc" style={{ height: '100%', justifyContent: 'center' }}>
        <div style={{ fontSize: 56 }}>✨</div>
        <div className="display" style={{ fontSize: 36 }}>nice!</div>
        <div className="body mt-4">{l.title} · complete</div>
        <div className="card mt-24" style={{ background: 'var(--bg-2)', borderColor: 'var(--accent)' }}>
          <div className="eyebrow">your jar</div>
          <div className="display mt-4" style={{ fontSize: 28 }}>{fmtBank(state.bank)}</div>
          <div className="body mt-4" style={{ fontSize: 12, color: 'var(--good)' }}>+{Math.floor(l.dur/60)}m earned this session</div>
        </div>
        <div className="col gap-8 mt-auto">
          {next
            ? <button className="btn btn-primary" onClick={() => goto('lesson', { courseId, lessonId: next.id })}>next lesson →</button>
            : <button className="btn btn-primary" onClick={() => goto('home')}>back home</button>}
          <button className="btn btn-ghost" onClick={() => goto('nibs-ask')}>break time (try nibs)</button>
        </div>
      </div>
    </div>
  );
};

// ------- NIBS ASK -------
const NibsAsk = ({ state, goto, close }) => (
  <div className="sheet-backdrop" onClick={close}>
    <div className="sheet" onClick={e => e.stopPropagation()}>
      <div className="sheet-handle"/>
      <div className="col aic">
        <Nibs size={120} mood="happy" />
      </div>
      <div className="display mt-12 tc" style={{ fontSize: 26 }}>need a break?</div>
      <div className="body tc mt-4">you've got <b style={{ color: 'var(--accent)' }}>{fmtBank(state.bank)}</b> in the jar.</div>
      {state.bank < 60 ? (
        <div className="card mt-16" style={{ background: 'var(--bg-3)' }}>
          <div className="body">jar's pretty low. study a little first?</div>
        </div>
      ) : null}
      <div className="col gap-8 mt-16">
        <button className="btn btn-primary" disabled={state.bank < 30} onClick={() => goto('budget')}
          style={{ opacity: state.bank < 30 ? 0.5 : 1 }}>yes please</button>
        <button className="btn btn-ghost" onClick={close}>not yet, keep going</button>
      </div>
    </div>
  </div>
);

// ------- BUDGET -------
const Budget = ({ state, set, goto }) => {
  const max = Math.min(state.bank, 1800); // cap at 30m in seconds for slider sanity
  const [budget, setBudget] = React.useState(Math.min(300, state.bank));
  const [nudgeAt, setNudgeAt] = React.useState(state.nudgeAt);
  const presets = [120, 300, 600, state.bank].filter((v,i,a) => v <= state.bank && a.indexOf(v) === i);

  return (
    <div className="app">
      <div className="topbar">
        <div className="back" onClick={() => goto('home')}>×</div>
        <div className="jar-chip"><div className="jar-dot"/>{fmtBank(state.bank)}</div>
      </div>
      <div className="pad pad-top col gap-12" style={{ paddingTop: 100, height: '100%' }}>
        <div className="eyebrow">budget</div>
        <div className="display" style={{ fontSize: 28 }}>how long?</div>

        <div className="row wrap gap-8 mt-4">
          {presets.map(p => (
            <div key={p} className={`chip ${budget === p ? 'active' : ''}`} onClick={() => setBudget(p)}>
              {p === state.bank ? 'all' : `${Math.floor(p/60)}m`}
            </div>
          ))}
        </div>

        <div className="card mt-8 col gap-12">
          <div className="display tc" style={{ fontSize: 44 }}>{fmtBank(budget)}</div>
          <input type="range" min="30" max={max} step="30" value={Math.min(budget, max)}
            onChange={e => setBudget(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }} />
          <div className="row between" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)' }}>
            <span>30s</span><span>jar: {fmtBank(state.bank)}</span>
          </div>
        </div>

        <div className="card col gap-8">
          <div className="eyebrow">nudge me at</div>
          <div className="row gap-6">
            {[60, 120, 0].map(n => (
              <div key={n} className={`chip ${nudgeAt === n ? 'active' : ''}`} onClick={() => setNudgeAt(n)}>
                {n === 0 ? 'off' : `${n}s left`}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto">
          <button className="btn btn-primary" onClick={() => {
            set(s => ({ ...s, budget, nudgeAt, feedStart: Date.now() }));
            goto('feed');
          }}>start scrolling →</button>
        </div>
      </div>
    </div>
  );
};

// ------- FEED -------
const FEED_VIDS = [
  { id: 'dQw4w9WgXcQ', user: '@neverendingref', caption: 'a classic never dies' },
  { id: 'jNQXAC9IVRw', user: '@me_at_zoo', caption: 'the first ever YouTube video' },
  { id: '9bZkp7q19f0', user: '@kpopclassics', caption: 'throwback vibes' },
  { id: 'kJQP7kiw5Fk', user: '@musicafuego', caption: 'the most watched music video' },
  { id: 'hY7m5jjJ9mM', user: '@ourplanet', caption: 'cats doing cat things' },
];

const Feed = ({ state, set, goto }) => {
  const [remain, setRemain] = React.useState(state.budget);
  const [idx, setIdx] = React.useState(0);
  const [showAngel, setShowAngel] = React.useState(false);
  const [nudged, setNudged] = React.useState(false);

  React.useEffect(() => {
    const t = setInterval(() => {
      setRemain(r => {
        if (r <= 1) {
          clearInterval(t);
          set(s => ({ ...s, bank: s.bank - state.budget, spentToday: s.spentToday + state.budget }));
          setTimeout(() => goto('time-up'), 400);
          return 0;
        }
        if (!nudged && state.nudgeAt > 0 && r - 1 === state.nudgeAt) {
          setNudged(true);
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const vid = FEED_VIDS[idx % FEED_VIDS.length];
  const pct = (remain / state.budget) * 100;
  const lowTime = state.nudgeAt > 0 && remain <= state.nudgeAt;

  const exit = () => {
    set(s => ({ ...s, bank: s.bank - (state.budget - remain), spentToday: s.spentToday + (state.budget - remain) }));
    goto('home');
  };

  return (
    <div className="app">
      <div className="feed">
        <div className="feed-video">
          <iframe key={vid.id}
            src={`https://www.youtube.com/embed/${vid.id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${vid.id}&rel=0&modestbranding=1`}
            allow="autoplay; encrypted-media" />
        </div>

        <div className="feed-top-bar"><i style={{ width: pct + '%', background: lowTime ? 'var(--nibs)' : 'var(--angel)' }}/></div>
        <div className="feed-top-chip">{fmtTime(remain)}</div>

        <div className={`warm-vignette ${lowTime ? 'on' : ''}`} />

        <div className="feed-overlay-info">
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600 }}>{vid.user}</div>
          <div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>{vid.caption}</div>
        </div>

        <div className="feed-side">
          <button><div className="icon-btn">♥</div><span>12k</span></button>
          <button><div className="icon-btn">💬</div><span>88</span></button>
          <button onClick={() => setIdx(i => i + 1)}><div className="icon-btn">↓</div><span>next</span></button>
        </div>

        {nudged && lowTime && (
          <div className="nibs-peek">
            <div className="bubble">{state.nudgeAt <= 60 ? '1 min left — still good?' : 'heads up, getting close'}</div>
            <Nibs size={80} mood="peek" />
          </div>
        )}

        <AngelHandle onSummon={() => setShowAngel(true)} />
      </div>

      {showAngel && (
        <div className="sheet-backdrop" onClick={() => setShowAngel(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle"/>
            <div className="col aic"><Angel size={120}/></div>
            <div className="display tc mt-12" style={{ fontSize: 26 }}>head back?</div>
            <div className="body tc mt-4">{fmtTime(remain)} still on your budget.</div>
            <div className="col gap-8 mt-16">
              <button className="btn btn-primary" onClick={exit}>back to learning</button>
              <button className="btn btn-ghost" disabled={state.bank - (state.budget - remain) < 300}
                      onClick={() => {
                        set(s => ({ ...s, budget: s.budget + 300 }));
                        setRemain(r => r + 300);
                        setShowAngel(false);
                        setNudged(false);
                      }}>+5 more min (from jar)</button>
              <button className="btn btn-ghost" onClick={() => setShowAngel(false)}>keep watching</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ------- TIME UP -------
const TimeUp = ({ goto }) => (
  <div className="app">
    <div className="pad col tc" style={{ height: '100%', justifyContent: 'center' }}>
      <Angel size={140}/>
      <div className="display mt-16" style={{ fontSize: 32 }}>that was fun.</div>
      <div className="body mt-8">ready to refill?</div>
      <div className="col gap-8 mt-32">
        <button className="btn btn-primary" onClick={() => goto('home')}>back to learning</button>
      </div>
    </div>
  </div>
);

// ------- PROGRESS (ledger + courses) -------
const Progress = ({ state, goto }) => {
  const [tab, setTab] = React.useState('ledger');
  return (
    <div className="app scroll">
      <div className="topbar">
        <div className="back" onClick={() => goto('home')}>‹</div>
        <div className="eyebrow">you</div>
        <div style={{ width: 36 }}/>
      </div>
      <div className="pad pad-top" style={{ paddingTop: 90 }}>
        <div className="display" style={{ fontSize: 28 }}>your progress</div>
        <div className="row gap-6 mt-12">
          <div className={`chip ${tab==='ledger' ? 'active' : ''}`} onClick={() => setTab('ledger')}>ledger</div>
          <div className={`chip ${tab==='courses' ? 'active' : ''}`} onClick={() => setTab('courses')}>courses</div>
        </div>

        {tab === 'ledger' && (
          <>
            <div className="card mt-16" style={{ background: 'var(--bg-3)' }}>
              <div className="row between aic">
                <div className="col"><div className="eyebrow">balance</div><div className="display mt-4" style={{ fontSize: 28 }}>{fmtBank(state.bank)}</div></div>
                <div className="col tc"><div className="eyebrow">streak</div><div className="display mt-4" style={{ fontSize: 20 }}>🔥 {state.streak}</div></div>
              </div>
              <div className="row gap-12 mt-12">
                <div className="col"><div className="eyebrow">earned today</div><div style={{ color: 'var(--good)', fontWeight: 600 }}>+{fmtBank(state.earnedToday)}</div></div>
                <div className="col"><div className="eyebrow">spent today</div><div style={{ color: 'var(--bad)', fontWeight: 600 }}>−{fmtBank(state.spentToday)}</div></div>
                <div className="col"><div className="eyebrow">rate</div><div style={{ fontWeight: 600 }}>1:{state.rate}</div></div>
              </div>
            </div>
            <div className="eyebrow mt-24">recent</div>
            <div className="col gap-6 mt-8">
              {(state.ledger || []).slice().reverse().map((e, i) => (
                <div key={i} className="card row between aic" style={{ padding: 12 }}>
                  <div className="body" style={{ color: 'var(--ink)' }}>{e.label}</div>
                  <div style={{ color: e.delta > 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 600, fontFamily: 'var(--mono)', fontSize: 13 }}>
                    {e.delta > 0 ? '+' : ''}{fmtBank(Math.abs(e.delta))}
                  </div>
                </div>
              ))}
              {(state.ledger || []).length === 0 && <div className="body tc">no activity yet today</div>}
            </div>
          </>
        )}

        {tab === 'courses' && (
          <div className="col gap-8 mt-16">
            {state.courses.map(c => {
              const done = c.lessons.filter(l => l.done).length;
              const total = c.lessons.length;
              return (
                <div key={c.id} className="card" onClick={() => goto('course', { courseId: c.id })}>
                  <div className="row between aic">
                    <div style={{ fontWeight: 600 }}>{c.title}</div>
                    <div className="body" style={{ fontSize: 12 }}>{done}/{total}</div>
                  </div>
                  <div className="bar mt-8"><i style={{ width: (done/total*100)+'%' }}/></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ------- ADD -------
const Add = ({ goto }) => (
  <div className="app">
    <div className="topbar"><div className="back" onClick={() => goto('home')}>‹</div></div>
    <div className="pad pad-top col gap-12" style={{ paddingTop: 90 }}>
      <div className="eyebrow">add</div>
      <div className="display" style={{ fontSize: 28 }}>paste a link</div>
      <div className="card" style={{ borderStyle: 'dashed', minHeight: 80 }}>
        <div className="body">https://youtube.com/…</div>
      </div>
      <div className="body">single video or playlist. we'll parse it into lessons.</div>
      <div className="mt-auto"><button className="btn btn-primary" onClick={() => goto('home')}>save to library</button></div>
    </div>
  </div>
);

// ------- DEV PANEL -------
const DevPanel = ({ state, set, close, goto }) => (
  <div className="dev-panel">
    <div className="row between aic">
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>dev · not shipped</div>
      <button className="btn-sm chip" onClick={close}>close</button>
    </div>
    <div className="display mt-8" style={{ fontSize: 22 }}>dev tools</div>

    <h3>add time (no watching)</h3>
    <div className="row wrap gap-6">
      {[60, 300, 1800, 3600].map(s => (
        <div key={s} className="chip" onClick={() => set(st => ({ ...st, bank: st.bank + s }))}>
          +{s >= 3600 ? '1h' : s >= 60 ? `${s/60}m` : `${s}s`}
        </div>
      ))}
      <div className="chip" onClick={() => set(st => ({ ...st, bank: 0 }))}>reset jar to 0</div>
    </div>

    <h3>shortcuts</h3>
    <div className="col gap-6">
      <button className="btn btn-ghost btn-sm" onClick={() => { set(st => ({ ...st, onboarded: false })); close(); goto('onboarding'); }}>restart onboarding</button>
      <button className="btn btn-ghost btn-sm" onClick={() => {
        set(st => ({
          ...st,
          courses: st.courses.map(c => ({ ...c, lessons: c.lessons.map(l => ({ ...l, done: true })) }))
        }));
      }}>mark all lessons done</button>
      <button className="btn btn-ghost btn-sm" onClick={() => {
        set(st => ({
          ...st,
          courses: st.courses.map(c => ({ ...c, lessons: c.lessons.map(l => ({ ...l, done: false })) }))
        }));
      }}>reset all lessons</button>
    </div>

    <h3>state</h3>
    <pre style={{ background: 'var(--bg-2)', padding: 12, borderRadius: 8, fontSize: 10, overflow: 'auto', maxHeight: 200 }}>
      {JSON.stringify({ bank: state.bank, streak: state.streak, rate: state.rate, earnedToday: state.earnedToday, spentToday: state.spentToday, interests: state.interests, showTimer: state.showTimer }, null, 2)}
    </pre>
  </div>
);

Object.assign(window, { Home, Course, Lesson, LessonDone, NibsAsk, Budget, Feed, TimeUp, Progress, Add, DevPanel, fmtBank, fmtTime });
