// Nibs & the Angel — refined cute-monster style
// Shared palette hooks: Nibs warm red/orange, Angel warm cream/gold.
// Both share the SAME geometry: blob body, little arms, expressive eyes, soft shading.

const Nibs = ({ size = 110, mood = 'happy', flipped = false }) => {
  // moods: happy, peek (only top half visible), o (surprise), sleepy, sly
  const eyeOffX = mood === 'peek' ? 2 : 0;
  const eyeOffY = mood === 'peek' ? 2 : mood === 'sly' ? 1 : 0;
  const closedEyes = mood === 'sleepy';
  return (
    <svg viewBox="0 0 140 160" width={size} height={size * (160/140)} style={{ transform: flipped ? 'scaleX(-1)' : 'none' }}>
      <defs>
        <radialGradient id="nibs-body" cx="0.35" cy="0.35" r="0.8">
          <stop offset="0%" stopColor="#f08560"/>
          <stop offset="55%" stopColor="#d85a3e"/>
          <stop offset="100%" stopColor="#a83e26"/>
        </radialGradient>
        <radialGradient id="nibs-belly" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="#ffb89a"/>
          <stop offset="100%" stopColor="#e87866" stopOpacity="0"/>
        </radialGradient>
      </defs>

      {/* horns — curved, with highlight */}
      <g>
        <path d="M28 48 C 18 26, 24 10, 34 6 C 38 22, 44 34, 50 48 Z" fill="#5a1a12" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M32 44 C 28 28, 30 18, 34 12" fill="none" stroke="#7a2218" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>
        <path d="M112 48 C 122 26, 116 10, 106 6 C 102 22, 96 34, 90 48 Z" fill="#5a1a12" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M108 44 C 112 28, 110 18, 106 12" fill="none" stroke="#7a2218" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>
      </g>

      {/* body — teardrop blob, rounded top, wider bottom */}
      <path d="M70 38
               C 32 38, 18 62, 18 92
               C 18 130, 42 148, 70 148
               C 98 148, 122 130, 122 92
               C 122 62, 108 38, 70 38 Z"
            fill="url(#nibs-body)" stroke="#1a0e08" strokeWidth="1.8" strokeLinejoin="round"/>

      {/* belly patch */}
      <ellipse cx="70" cy="108" rx="34" ry="28" fill="url(#nibs-belly)"/>

      {/* little arms */}
      <path d="M22 96 Q 10 104 14 118 Q 22 116 26 108" fill="url(#nibs-body)" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M118 96 Q 130 104 126 118 Q 118 116 114 108" fill="url(#nibs-body)" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round"/>

      {/* tail with arrow — peeks behind body */}
      <path d="M108 134 Q 126 138 128 120 L 134 128 M128 120 L 136 118"
            fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>

      {/* eyes */}
      {closedEyes ? (
        <>
          <path d="M48 80 Q 56 84 64 80" fill="none" stroke="#1a0e08" strokeWidth="2.2" strokeLinecap="round"/>
          <path d="M76 80 Q 84 84 92 80" fill="none" stroke="#1a0e08" strokeWidth="2.2" strokeLinecap="round"/>
        </>
      ) : (
        <>
          <ellipse cx="56" cy="80" rx="10" ry="11" fill="#fff" stroke="#1a0e08" strokeWidth="1.4"/>
          <ellipse cx="84" cy="80" rx="10" ry="11" fill="#fff" stroke="#1a0e08" strokeWidth="1.4"/>
          <circle cx={56 + eyeOffX} cy={82 + eyeOffY} r="4.5" fill="#1a0e08"/>
          <circle cx={84 + eyeOffX} cy={82 + eyeOffY} r="4.5" fill="#1a0e08"/>
          <circle cx={58 + eyeOffX} cy={79 + eyeOffY} r="1.8" fill="#fff"/>
          <circle cx={86 + eyeOffX} cy={79 + eyeOffY} r="1.8" fill="#fff"/>
          {/* top eyelid for sly */}
          {mood === 'sly' && (
            <>
              <path d="M46 76 Q 56 72 66 78" fill="#d85a3e" stroke="#1a0e08" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M74 78 Q 84 72 94 76" fill="#d85a3e" stroke="#1a0e08" strokeWidth="1.4" strokeLinecap="round"/>
            </>
          )}
        </>
      )}

      {/* mouth */}
      {mood === 'happy' && (
        <>
          <path d="M58 100 Q 70 112 82 100" fill="#3a0a04" stroke="#1a0e08" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          {/* tiny fang */}
          <path d="M64 100 L 66 106 L 68 100 Z" fill="#fff"/>
        </>
      )}
      {mood === 'o' && <ellipse cx="70" cy="104" rx="5" ry="6" fill="#3a0a04" stroke="#1a0e08" strokeWidth="1.4"/>}
      {mood === 'peek' && <path d="M60 102 Q 70 108 80 102" fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round"/>}
      {mood === 'sleepy' && <path d="M62 104 Q 70 106 78 104" fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round"/>}
      {mood === 'sly' && (
        <path d="M54 102 Q 64 110 78 104 L 82 108" fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      )}

      {/* blush cheeks */}
      <ellipse cx="40" cy="98" rx="6" ry="3.5" fill="#ff6a4a" opacity="0.55"/>
      <ellipse cx="100" cy="98" rx="6" ry="3.5" fill="#ff6a4a" opacity="0.55"/>
    </svg>
  );
};

const Angel = ({ size = 110, mood = 'happy' }) => {
  const closedEyes = mood === 'sleepy' || mood === 'peaceful';
  return (
    <svg viewBox="0 0 140 170" width={size} height={size * (170/140)}>
      <defs>
        <radialGradient id="angel-body" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0%" stopColor="#fff3d0"/>
          <stop offset="55%" stopColor="#f4dca0"/>
          <stop offset="100%" stopColor="#c8a560"/>
        </radialGradient>
        <radialGradient id="angel-belly" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="#fffbe8"/>
          <stop offset="100%" stopColor="#f4dca0" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="halo-grad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff3c8" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#f4c874" stopOpacity="0.2"/>
        </radialGradient>
      </defs>

      {/* halo glow backdrop */}
      <ellipse cx="70" cy="16" rx="32" ry="10" fill="url(#halo-grad)"/>
      {/* halo ring */}
      <ellipse cx="70" cy="16" rx="26" ry="6" fill="none" stroke="#f4c874" strokeWidth="3"/>
      <ellipse cx="70" cy="16" rx="26" ry="6" fill="none" stroke="#fff3d0" strokeWidth="1.2" opacity="0.8"/>

      {/* wings — soft feathered */}
      <g>
        <path d="M22 74 Q 4 96 10 124 Q 26 120 36 110 Q 30 96 28 82 Z"
              fill="#fff7e0" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M22 84 Q 14 98 18 116" fill="none" stroke="#d6b880" strokeWidth="1" opacity="0.8"/>
        <path d="M118 74 Q 136 96 130 124 Q 114 120 104 110 Q 110 96 112 82 Z"
              fill="#fff7e0" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M118 84 Q 126 98 122 116" fill="none" stroke="#d6b880" strokeWidth="1" opacity="0.8"/>
      </g>

      {/* body — same teardrop as Nibs */}
      <path d="M70 48
               C 32 48, 18 72, 18 102
               C 18 140, 42 158, 70 158
               C 98 158, 122 140, 122 102
               C 122 72, 108 48, 70 48 Z"
            fill="url(#angel-body)" stroke="#1a0e08" strokeWidth="1.8" strokeLinejoin="round"/>

      {/* belly */}
      <ellipse cx="70" cy="118" rx="34" ry="28" fill="url(#angel-belly)"/>

      {/* arms */}
      <path d="M22 106 Q 10 114 14 128 Q 22 126 26 118" fill="url(#angel-body)" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M118 106 Q 130 114 126 128 Q 118 126 114 118" fill="url(#angel-body)" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round"/>

      {/* eyes */}
      {closedEyes ? (
        <>
          <path d="M48 90 Q 56 94 64 90" fill="none" stroke="#1a0e08" strokeWidth="2.2" strokeLinecap="round"/>
          <path d="M76 90 Q 84 94 92 90" fill="none" stroke="#1a0e08" strokeWidth="2.2" strokeLinecap="round"/>
        </>
      ) : (
        <>
          <ellipse cx="56" cy="90" rx="10" ry="11" fill="#fff" stroke="#1a0e08" strokeWidth="1.4"/>
          <ellipse cx="84" cy="90" rx="10" ry="11" fill="#fff" stroke="#1a0e08" strokeWidth="1.4"/>
          <circle cx="56" cy="92" r="4.5" fill="#1a0e08"/>
          <circle cx="84" cy="92" r="4.5" fill="#1a0e08"/>
          <circle cx="58" cy="89" r="1.8" fill="#fff"/>
          <circle cx="86" cy="89" r="1.8" fill="#fff"/>
        </>
      )}

      {/* mouth — soft smile */}
      {mood === 'happy' && <path d="M60 112 Q 70 120 80 112" fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round"/>}
      {mood === 'peaceful' && <path d="M62 114 Q 70 116 78 114" fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round"/>}
      {mood === 'o' && <ellipse cx="70" cy="114" rx="4" ry="5" fill="#3a0a04" stroke="#1a0e08" strokeWidth="1.2"/>}
      {mood === 'sleepy' && <path d="M64 114 Q 70 116 76 114" fill="none" stroke="#1a0e08" strokeWidth="1.6" strokeLinecap="round"/>}

      {/* blush */}
      <ellipse cx="40" cy="108" rx="6" ry="3.5" fill="#ffa070" opacity="0.5"/>
      <ellipse cx="100" cy="108" rx="6" ry="3.5" fill="#ffa070" opacity="0.5"/>

      {/* sparkle */}
      <g opacity="0.85">
        <path d="M108 50 L 110 54 L 114 56 L 110 58 L 108 62 L 106 58 L 102 56 L 106 54 Z" fill="#fff3c8"/>
      </g>
    </svg>
  );
};

// Bottom-edge handle for demon (study pages) — now shows horns + eyes peeking
const NibsHandle = ({ onSummon, pulse = true }) => {
  const handlePointerDown = (e) => {
    e.preventDefault();
    const startY = e.clientY || (e.touches && e.touches[0].clientY);
    let summoned = false;
    const onMove = (ev) => {
      const y = ev.clientY || (ev.touches && ev.touches[0].clientY);
      if (!summoned && startY - y > 20) { summoned = true; onSummon(); }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!summoned) onSummon();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  return (
    <div className={`nibs-handle ${pulse ? 'nibs-pulse' : ''}`} onPointerDown={handlePointerDown} title="hold & pull up">
      <svg width="96" height="26" viewBox="0 0 96 26">
        {/* horns */}
        <path d="M18 26 C 12 10, 16 2, 22 0 C 24 10, 28 18, 32 26 Z" fill="#5a1a12" stroke="#1a0e08" strokeWidth="1.3" strokeLinejoin="round"/>
        <path d="M78 26 C 84 10, 80 2, 74 0 C 72 10, 68 18, 64 26 Z" fill="#5a1a12" stroke="#1a0e08" strokeWidth="1.3" strokeLinejoin="round"/>
        {/* red glow dot between horns */}
        <circle cx="48" cy="22" r="3" fill="#d85a3e" opacity="0.7"/>
      </svg>
    </div>
  );
};

// Bottom-edge handle for angel (feed) — halo + wing tips
const AngelHandle = ({ onSummon }) => {
  const handlePointerDown = (e) => {
    e.preventDefault();
    const startY = e.clientY || (e.touches && e.touches[0].clientY);
    let summoned = false;
    const onMove = (ev) => {
      const y = ev.clientY || (ev.touches && ev.touches[0].clientY);
      if (!summoned && startY - y > 20) { summoned = true; onSummon(); }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!summoned) onSummon();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  return (
    <div className="angel-handle" onPointerDown={handlePointerDown}>
      <svg width="96" height="28" viewBox="0 0 96 28">
        <ellipse cx="48" cy="10" rx="18" ry="4" fill="none" stroke="#f4c874" strokeWidth="2.2"/>
        <ellipse cx="48" cy="10" rx="18" ry="4" fill="none" stroke="#fff3d0" strokeWidth="1" opacity="0.7"/>
        <path d="M30 28 Q 24 18 34 14" fill="#fff7e0" stroke="#1a0e08" strokeWidth="1.2" strokeLinejoin="round"/>
        <path d="M66 28 Q 72 18 62 14" fill="#fff7e0" stroke="#1a0e08" strokeWidth="1.2" strokeLinejoin="round"/>
        <circle cx="48" cy="22" r="5" fill="#f4dca0" stroke="#1a0e08" strokeWidth="1.2"/>
      </svg>
    </div>
  );
};

Object.assign(window, { Nibs, Angel, NibsHandle, AngelHandle });
