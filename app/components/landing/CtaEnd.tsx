'use client';

import { motion } from 'framer-motion';

export default function CtaEnd({ reduce }: { reduce: boolean }) {
  return (
    <motion.section
      className="chapter"
      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: reduce ? 0.2 : 0.9 }}
    >
      <div className="cta-end">
        <div className="cta-inner">
          <div className="cta-mark">Learn · Tok</div>
          <h2>
            Make your time <em>count.</em>
          </h2>
          <p className="sub">
            The app is open. Your first lesson earns your first scroll.
          </p>
          <a className="cta-btn" href="/login" aria-label="Open LearnTok">
            Open LearnTok
            <span className="arrow" aria-hidden />
          </a>
          <div className="cta-foot">No ads. No infinite feed. Close the tab when you&rsquo;re done.</div>
        </div>
      </div>
    </motion.section>
  );
}
