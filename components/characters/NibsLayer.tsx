'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NibsBall } from './NibsBall';
import { BreakSheet } from './BreakSheet';

// Thin coordination wrapper: owns the open/close state so NibsBall's tap
// and BreakSheet's close callbacks can talk without lifting state into
// the root layout (which is a server component).
export function NibsLayer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close on route change. Submitting the sheet navigates to /feed;
  // without this the backdrop + sheet stay rendered on top of the next
  // page and obscure its controls.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <NibsBall onSummon={() => setOpen(true)} />
      <BreakSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
