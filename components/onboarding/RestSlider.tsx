'use client';
import React from 'react';

export const REST_MIN = 5;
export const REST_MAX = 60;
export const REST_STEP = 5;

export function moodLabel(restMin: number): string {
  if (restMin <= 5)  return 'monk mode';   // 5      → 12:1 learn:play
  if (restMin <= 15) return 'focused';     // 10-15  → 6:1 to 4:1
  if (restMin <= 30) return 'balanced';    // 20-30  → 3:1 to 2:1
  if (restMin <= 50) return 'easygoing';   // 35-50  → ~1.7:1 to ~1.2:1
  return 'playtime';                       // 55-60  → ~1.1:1 to 1:1
}

type Props = {
  restMin: number;
  onChange: (n: number) => void;
  /**
   * Optional callback fired on slider release. Profile page uses this to save
   * the value to the server only when the user lifts the pointer, not on every
   * tick. Onboarding doesn't pass it (it commits at CTA click instead).
   */
  onCommit?: (n: number) => void;
  /**
   * If true, drop the testids that are specific to the onboarding flow. Default
   * false so existing onboarding tests keep passing.
   */
  hideOnboardingTestIds?: boolean;
};

/**
 * Two info rows + slider + mood label. Used by both the onboarding deal card
 * and the profile settings card. Parent owns the `restMin` value; this is
 * stateless. The "Learn 1 hour" anchor is fixed; the slider varies "Rest".
 */
export function RestSlider({
  restMin,
  onChange,
  onCommit,
  hideOnboardingTestIds = false,
}: Props) {
  return (
    <div className="col gap-12">
      <div className="row between aic">
        <span className="body" style={{ color: 'var(--ink)' }}>Learn</span>
        <span className="display" style={{ fontSize: 22 }}>1 hour</span>
      </div>
      <div className="row between aic">
        <span className="body" style={{ color: 'var(--ink)' }}>Rest</span>
        <span
          className="display"
          style={{ fontSize: 28, color: 'var(--accent)' }}
          data-testid={hideOnboardingTestIds ? undefined : 'deal-rest-min'}
        >
          {restMin} min
        </span>
      </div>

      <input
        type="range"
        min={REST_MIN}
        max={REST_MAX}
        step={REST_STEP}
        value={restMin}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        onPointerUp={(e) =>
          onCommit?.(parseInt((e.target as HTMLInputElement).value, 10))
        }
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            onCommit?.(parseInt((e.target as HTMLInputElement).value, 10));
          }
        }}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
        data-testid={hideOnboardingTestIds ? 'rest-slider' : 'deal-slider'}
      />

      <div
        className="row"
        style={{
          justifyContent: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--ink-mute)',
        }}
        data-testid={hideOnboardingTestIds ? 'rest-mood' : 'deal-mood'}
      >
        {moodLabel(restMin)}
      </div>
    </div>
  );
}
