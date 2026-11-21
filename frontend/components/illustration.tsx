"use client";

import { useEffect, useRef } from "react";

export function Illustration({
  variant,
}: {
  variant: "landing" | "dashboard" | "groceries";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let cancelled = false;
    let scene: { dispose(): void } | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void import("@/experimental/illustration.js")
        .then(({ mountIllustration }) => {
          if (!cancelled) scene = mountIllustration(host, { variant });
        })
        .catch(() => {
          if (!cancelled) host.dataset.state = "fallback";
        });
    });
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
      scene?.dispose();
    };
  }, [variant]);
  return (
    <div ref={ref} className={`scene scene-${variant}`} aria-hidden="true">
      <img
        src={`/illustrations/${variant}.webp`}
        alt=""
        className="scene-poster"
      />
    </div>
  );
}
