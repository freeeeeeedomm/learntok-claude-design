'use client';
import { useState, useTransition } from 'react';
import { RestSlider } from '@/components/onboarding/RestSlider';
import { updateDisplayName, updateRestMinutes } from '@/app/profile/actions';

type Props = {
  initialDisplayName: string;
  initialRate: number; // numeric, e.g. 0.5
};

// Mirror of app/onboarding/page.tsx's rateToRestMinutes — kept tiny here
// to avoid coupling client component to a server file.
function rateToRestMinutes(rate: number): number {
  if (!rate || rate <= 0) return 30;
  const m = Math.round((rate * 60) / 5) * 5;
  if (m < 5 || m > 60) return 30;
  return m;
}

export function SettingsSection({ initialDisplayName, initialRate }: Props) {
  const [name, setName] = useState(initialDisplayName);
  const [savedName, setSavedName] = useState(initialDisplayName);
  const [restMin, setRestMin] = useState<number>(rateToRestMinutes(initialRate));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed === savedName) return;
    if (!trimmed) {
      setName(savedName); // revert empty entry
      return;
    }
    startTransition(async () => {
      const res = await updateDisplayName(trimmed);
      if ('error' in res) {
        setError(res.error);
        setName(savedName);
      } else {
        setSavedName(trimmed);
        setError(null);
      }
    });
  };

  const commitRest = (next: number) => {
    startTransition(async () => {
      const res = await updateRestMinutes(next);
      if ('error' in res) {
        setError(res.error);
      } else {
        setError(null);
      }
    });
  };

  return (
    <section className="profile-section" data-testid="profile-settings">
      <div className="profile-section-title">settings</div>

      <div className="card">
        <div className="profile-row">
          <span className="body" style={{ color: 'var(--ink)' }}>Display name</span>
          <input
            type="text"
            className="profile-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setName(savedName);
                (e.target as HTMLInputElement).blur();
              }
            }}
            maxLength={40}
            data-testid="profile-name-input"
          />
        </div>

        <div className="profile-row" style={{ display: 'block', paddingTop: 16 }}>
          <RestSlider
            restMin={restMin}
            onChange={setRestMin}
            onCommit={commitRest}
            hideOnboardingTestIds
          />
        </div>
      </div>

      {error && (
        <div
          className="body"
          role="alert"
          style={{ color: 'var(--bad)', fontSize: 12, marginTop: 8 }}
          data-testid="profile-settings-error"
        >
          {error}
        </div>
      )}
    </section>
  );
}
