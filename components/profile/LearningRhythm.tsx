'use client';
type Session = { id: string; kind: 'learn' | 'feed'; startedAt: string; durationSec: number };
type Props = { sessions: Session[] };
export function LearningRhythm(_props: Props) {
  return <div data-testid="profile-rhythm" className="mt-24" />;
}
