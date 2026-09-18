"use client";

import { m, useReducedMotion, type Variants } from "framer-motion";

/**
 * Shared reveal primitives for the marketing pages.
 *
 * Every wrapper is tagged `data-reveal` so app/globals.css can force it visible
 * under `@media (scripting: none)` — without that, a no-JS visitor would see
 * framer's server-rendered `initial` styles (opacity 0) and the page would look
 * blank below the fold.
 *
 * Reduced motion is handled by framer's own `useReducedMotion()`: with the OS
 * setting on, these degrade to plain divs with no inline styles at all.
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** Fade-up a single block when it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div data-reveal className={className}>
        {children}
      </div>
    );
  }

  return (
    <m.div
      data-reveal
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={FADE_UP}
      transition={{ delay }}
    >
      {children}
    </m.div>
  );
}

/** Container that staggers its <StaggerItem> children as it scrolls in. */
export function Stagger({
  children,
  className,
  delay = 0,
  step = 0.08,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  step?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div data-reveal className={className}>
        {children}
      </div>
    );
  }

  return (
    <m.div
      data-reveal
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: step, delayChildren: delay } },
      }}
    >
      {children}
    </m.div>
  );
}

/** A single staggered child. Only meaningful inside <Stagger>. */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <m.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
      }}
    >
      {children}
    </m.div>
  );
}
