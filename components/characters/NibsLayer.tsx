'use client';

import { useState } from 'react';
import { NibsBall } from './NibsBall';
import { BreakSheet } from './BreakSheet';

// Thin coordination wrapper: owns the open/close state so NibsBall's tap
// and BreakSheet's close callbacks can talk without lifting state into
// the root layout (which is a server component).
export function NibsLayer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NibsBall onSummon={() => setOpen(true)} />
      <BreakSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
