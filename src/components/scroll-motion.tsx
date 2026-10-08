'use client';
import { useEffect, useRef, type ReactNode } from 'react';

export function ScrollMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const elements = ref.current?.querySelectorAll<HTMLElement>('[data-motion], [data-animation-scene]');
    if (!elements) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.setAttribute('data-visible', String(entry.isIntersecting));
      }
    }, { threshold: 0.15 });
    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}
