// Onboarding comic scenes 1–5, ported from v3/onboarding.jsx.
'use client';
import React from 'react';
import { Nibs } from '@/components/characters/Nibs';
import { Angel } from '@/components/characters/Angel';

function useTick(active: boolean) {
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    let raf = 0;
    let start: number | undefined;
    const loop = (ts: number) => {
      if (start === undefined) start = ts;
      setT((ts - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return t;
}

function Scene1() {
  const t = useTick(true);
  const scroll = (t * 60) % 80;
  return (
    <svg viewBox="0 0 300 260" width="100%" style={{ maxWidth: 320 }}>
      <defs>
        <radialGradient id="s1glow" cx="0.5" cy="0.45" r="0.5">
          <stop offset="0%" stopColor="#e89a56" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#e89a56" stopOpacity="0" />
        </radialGradient>
        <clipPath id="phoneClip"><rect x="108" y="60" width="84" height="150" rx="10" /></clipPath>
      </defs>
      <rect width="300" height="260" fill="#0a0806" />
      <ellipse cx="150" cy="130" rx="140" ry="100" fill="url(#s1glow)" />
      <rect x="104" y="56" width="92" height="158" rx="14" fill="#1a1610" stroke="#2e2720" strokeWidth="1.5" />
      <rect x="108" y="60" width="84" height="150" rx="10" fill="#0c0a08" />
      <g clipPath="url(#phoneClip)">
        <g transform={`translate(0, ${-scroll})`}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <g key={i} transform={`translate(0, ${i * 40})`}>
              <rect x="114" y={64 + i * 40} width="72" height="34" rx="4" fill="#2a1f18" />
              <rect x="118" y={70 + i * 40} width="40" height="4" rx="1" fill="#6a5540" />
              <rect x="118" y={78 + i * 40} width="30" height="3" rx="1" fill="#3e3228" />
              <circle cx="176" cy={84 + i * 40} r="5" fill="#e89a56" opacity="0.4" />
            </g>
          ))}
        </g>
      </g>
      <g>
        <ellipse cx="195" cy={180 + Math.sin(t * 3) * 14} rx="22" ry="30" fill="#e4c4a0" stroke="#1a0e08" strokeWidth="1.4" />
        <ellipse cx="195" cy={165 + Math.sin(t * 3) * 14} rx="12" ry="14" fill="#e4c4a0" stroke="#1a0e08" strokeWidth="1.4" />
        <path d="M185 155 Q 195 150 205 155" fill="none" stroke="#1a0e08" strokeWidth="1" opacity="0.4" />
      </g>
      <g opacity={Math.min(1, t / 1.5)}>
        <text x="24" y="40" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#6a5540">23:14</text>
        <text x="24" y="60" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#8a6d50">23:47</text>
        <text x="24" y="80" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#b08a65" opacity={Math.min(1, (t - 1) / 1.5)}>00:22</text>
        <text x="24" y="100" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#d85a3e" opacity={Math.min(1, (t - 2) / 1.5)}>01:08</text>
      </g>
    </svg>
  );
}

function Scene2() {
  const t = useTick(true);
  const sink = Math.min(1, t / 1.5);
  return (
    <svg viewBox="0 0 300 260" width="100%" style={{ maxWidth: 320 }}>
      <defs>
        <linearGradient id="sunlight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4c874" />
          <stop offset="100%" stopColor="#f4c874" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="300" height="260" fill="#1a1410" />
      <rect x="0" y="180" width="300" height="80" fill="#2a1f18" />
      <line x1="0" y1="180" x2="300" y2="180" stroke="#3a2d20" strokeWidth="1" />
      <rect x="200" y="20" width="80" height="120" fill="#3a2d20" stroke="#4a3828" strokeWidth="1" />
      <line x1="240" y1="20" x2="240" y2="140" stroke="#4a3828" strokeWidth="1" />
      <line x1="200" y1="80" x2="280" y2="80" stroke="#4a3828" strokeWidth="1" />
      <path d="M200 140 L 280 140 L 280 20 L 200 20 Z" fill="url(#sunlight)" opacity="0.6" />
      <g transform={`translate(40, ${150 + sink * 8})`}>
        <rect x="0" y="8" width="90" height="20" rx="2" fill="#7a4a28" stroke="#1a0e08" strokeWidth="1.4" />
        <rect x="2" y="0" width="88" height="10" rx="1" fill="#8a5a38" stroke="#1a0e08" strokeWidth="1.4" />
        <rect x="8" y="3" width="60" height="2" fill="#4a2a18" />
        <rect x="8" y="7" width="40" height="1.5" fill="#4a2a18" />
      </g>
      <g transform="translate(140, 90)">
        <circle r="22" fill="#2a1f18" stroke="#6a5540" strokeWidth="1.5" />
        <line x1="0" y1="0" x2="0" y2="-14" stroke="#d85a3e" strokeWidth="2" strokeLinecap="round" />
        <line x1="0" y1="0" x2="10" y2="4" stroke="#e89a56" strokeWidth="1.5" strokeLinecap="round" />
        <circle r="2" fill="#e89a56" />
      </g>
      <g opacity={sink} transform={`translate(160, ${60 - sink * 10})`}>
        <text fontFamily="Fraunces, serif" fontSize="22" fontStyle="italic" fill="#b8ad9a">…oof.</text>
      </g>
    </svg>
  );
}

function Scene3() {
  const t = useTick(true);
  const angle = (t * 60) % 360;
  const nodes = [
    { a: 0, l: 'open' },
    { a: 90, l: 'scroll' },
    { a: 180, l: 'lose time' },
    { a: 270, l: 'feel bad' },
  ];
  return (
    <svg viewBox="0 0 300 260" width="100%" style={{ maxWidth: 320 }}>
      <rect width="300" height="260" fill="#13110e" />
      <g transform="translate(150, 130)">
        <circle r="80" fill="none" stroke="#2e2720" strokeWidth="2" strokeDasharray="4 6" />
        <g transform={`rotate(${angle})`}>
          <polygon points="78,-6 88,0 78,6" fill="#d85a3e" />
        </g>
        <g transform={`rotate(${angle + 180})`}>
          <polygon points="78,-6 88,0 78,6" fill="#d85a3e" />
        </g>
        {nodes.map((n, i) => {
          const rad = (n.a * Math.PI) / 180;
          const x = Math.cos(rad) * 80;
          const y = Math.sin(rad) * 80;
          return (
            <g key={i} transform={`translate(${x}, ${y})`}>
              <circle r="20" fill="#1c1814" stroke="#d85a3e" strokeWidth="1.5" />
              <text fontFamily="Inter, sans-serif" fontSize="10" fill="#f3ece0" textAnchor="middle" y="3">{n.l}</text>
            </g>
          );
        })}
        <text fontFamily="Fraunces, serif" fontSize="14" fill="#e89a56" textAnchor="middle" y="4" fontStyle="italic">the loop</text>
      </g>
    </svg>
  );
}

function Scene4() {
  const t = useTick(true);
  const phase = (t % 3) / 3;
  const bookX = 60 - phase * 20;
  const videoOpacity = Math.min(1, phase * 2);
  const jarFill = Math.min(1, phase * 1.2);
  return (
    <svg viewBox="0 0 300 260" width="100%" style={{ maxWidth: 320 }}>
      <rect width="300" height="260" fill="#13110e" />
      <g transform={`translate(${bookX}, 100)`}>
        <rect x="0" y="0" width="70" height="60" rx="3" fill="#2a1f18" stroke="#6a5540" strokeWidth="1.4" />
        <line x1="10" y1="14" x2="60" y2="14" stroke="#6a5540" strokeWidth="1.2" />
        <line x1="10" y1="22" x2="60" y2="22" stroke="#6a5540" strokeWidth="1.2" />
        <line x1="10" y1="30" x2="50" y2="30" stroke="#6a5540" strokeWidth="1.2" />
        <text x="35" y="52" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#e89a56">learn</text>
      </g>
      <g transform="translate(130, 120)">
        <path d="M0 15 L 30 15 M 24 9 L 30 15 L 24 21" fill="none" stroke="#e89a56" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g transform="translate(170, 80)">
        <path d="M10 20 L 10 100 Q 10 110 20 110 L 50 110 Q 60 110 60 100 L 60 20 Z" fill="none" stroke="#e89a56" strokeWidth="2" />
        <path d="M8 18 L 62 18" stroke="#e89a56" strokeWidth="2" strokeLinecap="round" />
        <path d={`M10 ${110 - jarFill * 80} L 60 ${110 - jarFill * 80} L 60 100 Q 60 110 50 110 L 20 110 Q 10 110 10 100 Z`} fill="#e89a56" opacity="0.7" />
      </g>
      <g transform="translate(240, 100)" opacity={videoOpacity}>
        <rect x="0" y="0" width="40" height="70" rx="6" fill="#1a1610" stroke="#6a5540" strokeWidth="1.2" />
        <rect x="3" y="3" width="34" height="64" rx="3" fill="#0c0a08" />
        <polygon points="14,22 14,46 30,34" fill="#e89a56" />
      </g>
      <text x="150" y="230" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="18" fontStyle="italic" fill="#f3ece0">learn → earn → play</text>
    </svg>
  );
}

function Scene5() {
  const t = useTick(true);
  const bob = Math.sin(t * 2) * 4;
  return (
    <svg viewBox="0 0 300 260" width="100%" style={{ maxWidth: 320 }}>
      <rect width="300" height="260" fill="#13110e" />
      <text x="150" y="40" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#7a7062" letterSpacing="2">NOT ALONE</text>
      <g transform={`translate(60, ${170 + bob})`}>
        <Nibs size={110} mood="happy" />
      </g>
      <g transform={`translate(170, ${170 - bob})`}>
        <Angel size={110} mood="happy" />
      </g>
      <text x="150" y="245" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="18" fill="#f3ece0" fontStyle="italic">two little helpers</text>
    </svg>
  );
}

export function ComicScene({ which }: { which: 1 | 2 | 3 | 4 | 5 }) {
  switch (which) {
    case 1: return <Scene1 />;
    case 2: return <Scene2 />;
    case 3: return <Scene3 />;
    case 4: return <Scene4 />;
    case 5: return <Scene5 />;
  }
}
