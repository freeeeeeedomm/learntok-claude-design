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
          <h2>
            Make your time <em>count.</em>
          </h2>
          <a className="cta-btn" href="/login" aria-label="Open LearnTok">
            Open LearnTok
            <span className="arrow" aria-hidden />
          </a>
        </div>
      </div>
    </motion.section>
  );
}
