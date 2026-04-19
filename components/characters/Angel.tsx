// Angel — cute helper, warm cream/gold palette. Ported from v3/characters.jsx.
import React from 'react';

type Mood = 'happy' | 'peaceful' | 'sleepy' | 'o';
type Props = { size?: number; mood?: Mood };

export function Angel({ size = 110, mood = 'happy' }: Props) {
  const closedEyes = mood === 'sleepy' || mood === 'peaceful';
  return (
    <svg viewBox="0 0 140 170" width={size} height={size * (170 / 140)}>
      <defs>
        <radialGradient id="angel-body" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0%" stopColor="#fff3d0" />
          <stop offset="55%" stopColor="#f4dca0" />
          <stop offset="100%" stopColor="#c8a560" />
        </radialGradient>
        <radialGradient id="angel-belly" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="#fffbe8" />
          <stop offset="100%" stopColor="#f4dca0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="halo-grad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff3c8" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f4c874" stopOpacity="0.2" />
        </radialGradient>
      </defs>

      <ellipse cx="70" cy="16" rx="32" ry="10" fill="url(#halo-grad)" />
      <ellipse cx="70" cy="16" rx="26" ry="6" fill="none" stroke="#f4c874" strokeWidth="3" />
      <ellipse cx="70" cy="16" rx="26" ry="6" fill="none" stroke="#fff3d0" strokeWidth="1.2" opacity="0.8" />

      <g>
        <path d="M22 74 Q 4 96 10 124 Q 26 120 36 110 Q 30 96 28 82 Z"
          fill="#fff7e0" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M22 84 Q 14 98 18 116" fill="none" stroke="#d6b880" strokeWidth="1" opacity="0.8" />
        <path d="M118 74 Q 136 96 130 124 Q 114 120 104 110 Q 110 96 112 82 Z"
          fill="#fff7e0" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M118 84 Q 126 98 122 116" fill="none" stroke="#d6b880" strokeWidth="1" opacity="0.8" />
      </g>

      <path d="M70 48 C 32 48, 18 72, 18 102 C 18 140, 42 158, 70 158 C 98 158, 122 140, 122 102 C 122 72, 108 48, 70 48 Z"
        fill="url(#angel-body)" stroke="#1a0e08" strokeWidth="1.8" strokeLinejoin="round" />

      <ellipse cx="70" cy="118" rx="34" ry="28" fill="url(#angel-belly)" />

      <path d="M22 106 Q 10 114 14 128 Q 22 126 26 118" fill="url(#angel-body)" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M118 106 Q 130 114 126 128 Q 118 126 114 118" fill="url(#angel-body)" stroke="#1a0e08" strokeWidth="1.6" strokeLinejoin="round" />

      {closedEyes ? (
        <>
          <path d="M48 90 Q 56 94 64 90" fill="none" stroke="#1a0e08" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M76 90 Q 84 94 92 90" fill="none" stroke="#1a0e08" strokeWidth="2.2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="56" cy="90" rx="10" ry="11" fill="#fff" stroke="#1a0e08" strokeWidth="1.4" />
          <ellipse cx="84" cy="90" rx="10" ry="11" fill="#fff" stroke="#1a0e08" strokeWidth="1.4" />
          <circle cx="56" cy="92" r="4.5" fill="#1a0e08" />
          <circle cx="84" cy="92" r="4.5" fill="#1a0e08" />
          <circle cx="58" cy="89" r="1.8" fill="#fff" />
          <circle cx="86" cy="89" r="1.8" fill="#fff" />
        </>
      )}

      {mood === 'happy' && <path d="M60 112 Q 70 120 80 112" fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round" />}
      {mood === 'peaceful' && <path d="M62 114 Q 70 116 78 114" fill="none" stroke="#1a0e08" strokeWidth="1.8" strokeLinecap="round" />}
      {mood === 'o' && <ellipse cx="70" cy="114" rx="4" ry="5" fill="#3a0a04" stroke="#1a0e08" strokeWidth="1.2" />}
      {mood === 'sleepy' && <path d="M64 114 Q 70 116 76 114" fill="none" stroke="#1a0e08" strokeWidth="1.6" strokeLinecap="round" />}

      <ellipse cx="40" cy="108" rx="6" ry="3.5" fill="#ffa070" opacity="0.5" />
      <ellipse cx="100" cy="108" rx="6" ry="3.5" fill="#ffa070" opacity="0.5" />

      <g opacity="0.85">
        <path d="M108 50 L 110 54 L 114 56 L 110 58 L 108 62 L 106 58 L 102 56 L 106 54 Z" fill="#fff3c8" />
      </g>
    </svg>
  );
}
