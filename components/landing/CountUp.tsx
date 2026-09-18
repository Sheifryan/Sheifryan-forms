"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/**
 * Count-up figure for the workspace stat cards.
 *
 * Ordering matters: the *real* number is what gets server-rendered (so SEO,
 * no-JS visitors and the first client render all agree), then a mount effect
 * resets it to 0 while the element is still off-screen, and the count-up runs
 * the first time it scrolls into view. With reduced motion the figure stays
 * static at its true value.
 *
 * Formatting is pinned to "en-US" on purpose: a browser whose default locale is
 * e.g. de-DE would otherwise render "3.842" against the server's "3,842" and
 * trigger a hydration mismatch.
 */
export function CountUp({
  value,
  duration = 1.4,
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);

  // Reset to zero after mount (off-screen in every layout we ship) so the
  // count-up has somewhere to run from.
  useEffect(() => {
    if (!reduce) setDisplay(0);
  }, [reduce]);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, reduce, value, duration]);

  const text = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Math.round(display)
  );

  return (
    <span ref={ref} className={className}>
      {text}
      {suffix}
    </span>
  );
}
