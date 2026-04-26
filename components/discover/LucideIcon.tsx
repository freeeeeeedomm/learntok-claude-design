'use client';
import {
  // group icons
  LineChart, Landmark, FlaskConical, Sigma, Code,
  // topic icons
  Coins, Globe, TrendingUp,
  Globe2, Flag, Palette, Scale,
  Atom, TestTube, Dna, Telescope, Zap, Clapperboard,
  Variable, Calculator, Triangle, Waves, Infinity as InfinityIcon,
  Grid3x3, Box, Spline,
  Braces, Cpu,
  // shared / fallback
  Compass, User, Home, Coffee,
} from 'lucide-react';
import type { LucideIcon as LucideIconType } from 'lucide-react';

type IconCmp = LucideIconType;

const MAP: Record<string, IconCmp> = {
  LineChart, Landmark, FlaskConical, Sigma, Code,
  Coins, Globe, TrendingUp,
  Globe2, Flag, Palette, Scale,
  Atom, TestTube, Dna, Telescope, Zap, Clapperboard,
  Variable, Calculator, Triangle, Waves, Infinity: InfinityIcon,
  Grid3x3, Box, Spline,
  Braces, Cpu,
  Compass, User, Home, Coffee,
};

export function LucideIcon({
  name,
  size = 24,
  strokeWidth = 1.8,
  className,
}: {
  name: string | null | undefined;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Cmp = name ? MAP[name] : undefined;
  if (!Cmp) {
    // Fallback: neutral dot, same footprint as a real icon.
    return (
      <span
        aria-hidden
        className={className}
        style={{ display: 'inline-block', width: size, height: size, lineHeight: `${size}px`, textAlign: 'center', color: 'var(--ink-mute)' }}
      >
        •
      </span>
    );
  }
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
