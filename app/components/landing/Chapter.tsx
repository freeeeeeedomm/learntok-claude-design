'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

type Props = {
  big: React.ReactNode;
  small: string;
  video: string;
  videoBlobUrl?: string;
  reduce: boolean;
};

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

const lineVariants = (delay: number, reduce: boolean) => ({
  initial: { opacity: 0, y: reduce ? 0 : 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: reduce ? 0.2 : 0.7,
      ease: [0.2, 0.6, 0.2, 1] as const,
      delay: reduce ? 0 : delay,
    },
  },
});

export default function Chapter({
  big,
  small,
  video,
  videoBlobUrl,
  reduce,
}: Props) {
  const vRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = vRef.current;
    if (!v) return;
    v.play().catch(() => {});
  }, [videoBlobUrl]);

  return (
    <motion.section
      className="chapter"
      variants={fade}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: reduce ? 0.2 : 0.9, ease: [0.2, 0.6, 0.2, 1] }}
    >
      <div className="media">
        <video
          ref={vRef}
          src={videoBlobUrl || video}
          autoPlay
          muted
          playsInline
          preload="auto"
        />
      </div>
      <div className="copy">
        <h1>
          <motion.span
            className="line"
            variants={lineVariants(0.34, reduce)}
            initial="initial"
            animate="animate"
            style={{ display: 'inline-block' }}
          >
            {big}
          </motion.span>
        </h1>
        <motion.p
          className="sub"
          variants={lineVariants(0.62, reduce)}
          initial="initial"
          animate="animate"
        >
          {small}
        </motion.p>
      </div>
    </motion.section>
  );
}
