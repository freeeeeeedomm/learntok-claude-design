// Nibs — cute monster, warm red/orange palette. Ported from v3/characters.jsx.
import React from 'react';

type Mood = 'happy' | 'peek' | 'o' | 'sleepy' | 'sly';
type Props = { size?: number; mood?: Mood; flipped?: boolean };

export function Nibs({ size = 110, mood = 'happy', flipped = false }: Props) {
  const eyeOffX = mood === 'peek' ? 2 : 0;
  const eyeOffY = mood === 'peek' ? 2 : mood === 'sly' ? 1 : 0;
  const closedEyes = mood === 'sleepy';
  return (
    <svg viewBox="0 0 140 160" width={size} height={size * (160 / 140)} style={{ transform: flipped ? 'scaleX(-1)' : undefined }}>
      <defs>
        <radialGradient id="nibs-body" cx="0.35" cy="0.35" r="0.8">
          <stop offset="0%" stopColor="#f08560" />
          <stop offset="55%" stopColor="#d85a3e" />
          <stop offset="100%" stopColor="#a83e26" />
        </radialGradient>
        <radialGradient id="nibs-belly" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="#ffb89a" />
          <stop offset="100%" stopColor="#e87866" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g>
        <path d="M28 48 C 18 26, 24 10, 34 6 C 38 22, 44 34, 50 48 Z" fill="#5a1a12" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M32 44 C 28 28, 30 18, 34 12" fill="none" stroke="#7a2218" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
        <path d="M112 48 C 122 26, 116 10, 106 6 C 102 22, 96 34, 90 48 Z" fill="#5a1a12" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M108 44 C 112 28, 110 18, 106 12" fill="none" stroke="#7a2218" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      </g>

      <path d="M70 38 C 32 38, 18 62, 18 92 C 18 130, 42 148, 70 148 C 98 148, 122 130, 122 92 C 122 62, 108 38, 70 38 Z"
        fill="url(#nibs-body)" stroke="#1a0e08" strokeWidth="1.8" strokeLinejoin="round" />
      <ellipse cx="70" cy="108" rx="34" ry="28" fill="url(#nibs-belly)" />

      <path d="M22 96 Q 10 104 14 118 Q 22 116 26 108" fill="url(#nibs-body)" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M118 96 Q 130 104 126 118 Q 118 116 114 108" fill="url(#nibs-body)" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round" />

      <path d="M108 134 Q 126 138 128 120 L 134 128 M128 120 L 136 118"
        fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

      {closedEyes ? (
        <>
          <path d="M48 80 Q 56 84 64 80" fill="none" stroke="#1a0e08" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M76 80 Q 84 84 92 80" fill="none" stroke="#1a0e08" strokeWidth="2.2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="56" cy="80" rx="10" ry="11" fill="#fff" stroke="#1a0e08" strokeWidth="1.4" />
          <ellipse cx="84" cy="80" rx="10" ry="11" fill="#fff" stroke="#1a0e08" strokeWidth="1.4" />
          <circle cx={56 + eyeOffX} cy={82 + eyeOffY} r="4.5" fill="#1a0e08" />
          <circle cx={84 + eyeOffX} cy={82 + eyeOffY} r="4.5" fill="#1a0e08" />
          <circle cx={58 + eyeOffX} cy={79 + eyeOffY} r="1.8" fill="#fff" />
          <circle cx={86 + eyeOffX} cy={79 + eyeOffY} r="1.8" fill="#fff" />
          {mood === 'sly' && (
            <>
              <path d="M46 76 Q 56 72 66 78" fill="#d85a3e" stroke="#1a0e08" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M74 78 Q 84 72 94 76" fill="#d85a3e" stroke="#1a0e08" strokeWidth="1.4" strokeLinecap="round" />
            </>
          )}
        </>
      )}

      {mood === 'happy' && (
        <>
          <path d="M58 100 Q 70 112 82 100" fill="#3a0a04" stroke="#1a0e08" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M64 100 L 66 106 L 68 100 Z" fill="#fff" />
        </>
      )}
      {mood === 'o' && <ellipse cx="70" cy="104" rx="5" ry="6" fill="#3a0a04" stroke="#1a0e08" strokeWidth="1.4" />}
      {mood === 'peek' && <path d="M60 102 Q 70 108 80 102" fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round" />}
      {mood === 'sleepy' && <path d="M62 104 Q 70 106 78 104" fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round" />}
      {mood === 'sly' && (
        <path d="M54 102 Q 64 110 78 104 L 82 108" fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}

      <ellipse cx="40" cy="98" rx="6" ry="3.5" fill="#ff6a4a" opacity="0.55" />
      <ellipse cx="100" cy="98" rx="6" ry="3.5" fill="#ff6a4a" opacity="0.55" />
    </svg>
  );
}
