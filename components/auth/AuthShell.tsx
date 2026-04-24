'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

type Props = {
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ onBack, children, footer }: Props) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.push('/'));

  return (
    <main className="min-h-screen bg-bg text-ink flex flex-col">
      <header className="px-5 pt-5">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Go back"
          className="-ml-2 p-2 text-ink"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </header>
      <div className="flex-1 flex flex-col items-center px-6 pt-10 sm:pt-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      {footer && (
        <div className="px-6 pb-10 w-full max-w-sm mx-auto text-center">
          {footer}
        </div>
      )}
    </main>
  );
}
