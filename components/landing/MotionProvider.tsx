"use client";

import { LazyMotion, domAnimation } from "framer-motion";

/**
 * Single motion context for the public marketing pages.
 *
 * `LazyMotion` + `m.*` keeps framer-motion's bundle to the DOM-animation subset
 * (~15 kB gzip) instead of the full feature set (~34 kB). `strict` makes any
 * stray `motion.*` import throw at runtime rather than silently pulling the
 * whole library back in, so the landing page can't regress by accident.
 *
 * Children may be server-rendered elements: the context is resolved on the
 * client, so an `m.*` inside a client child still finds its provider.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
