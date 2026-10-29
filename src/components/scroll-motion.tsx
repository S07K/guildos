'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function ScrollMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);
    const completed = new WeakSet<Element>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.setAttribute('data-visible', String(entry.isIntersecting)));
    }, { threshold: .15 });
    root.querySelectorAll('[data-animation-scene]').forEach(element => observer.observe(element));

    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const reveals = new Map<HTMLElement, gsap.core.Tween>();
      root.querySelectorAll<HTMLElement>('[data-motion]').forEach(element => {
        if (completed.has(element)) return;
        const hero = element.dataset.motion === 'hero';
        const coast = element.dataset.motion === 'coast';
        const tween = gsap.fromTo(element,
          { opacity: hero ? .5 : 0, y: coast ? 32 : 24, scale: coast ? .97 : 1 },
          {
            opacity: 1, y: 0, scale: 1,
            duration: coast ? 1.25 : .9,
            delay: Number(element.dataset.delay || 0) / 1000,
            ease: 'power3.out',
            clearProps: 'transform,opacity',
            onComplete: () => { completed.add(element); },
            ...(hero ? {} : { scrollTrigger: { trigger: element, start: 'top 90%', once: true } }),
          },
        );
        reveals.set(element, tween);
      });

      root.querySelectorAll<HTMLElement>('[data-stagger]').forEach(container => {
        const items = container.querySelectorAll<HTMLElement>('[data-stagger-item]');
        if (!items.length) return;
        const sequence = gsap.timeline({ scrollTrigger: { trigger: container, start: 'top 82%', once: true } });
        sequence.fromTo(items,
          { autoAlpha: 0, y: 24, scale: .985 },
          { autoAlpha: 1, y: 0, scale: 1, duration: .7, stagger: .14, ease: 'power3.out', clearProps: 'transform,opacity,visibility' },
        );
      });

      root.querySelectorAll<HTMLElement>('[data-progress]').forEach(element => {
        gsap.fromTo(element, { scaleX: 0 }, {
          scaleX: 1,
          duration: 1.1,
          ease: 'power2.out',
          scrollTrigger: { trigger: element, start: 'top 88%', once: true },
        });
      });

      root.querySelectorAll<HTMLElement>('[data-note-motion]').forEach(element => {
        const art = element.querySelector<HTMLElement>('.field-note-art > div');
        if (!art) return;
        gsap.fromTo(art, { y: 12 }, {
          y: -12, ease: 'none',
          scrollTrigger: { trigger: element, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });

      root.querySelectorAll<HTMLElement>('[data-parallax]').forEach(element => {
        const distance = () => window.innerWidth <= 640 ? 12 : 26;
        gsap.fromTo(element, { y: () => -distance(), scale: 1.06 }, {
          y: distance, scale: 1.06, ease: 'none',
          scrollTrigger: {
            trigger: element.parentElement,
            start: 'top bottom', end: 'bottom top',
            scrub: .8, invalidateOnRefresh: true,
          },
        });
      });

      const onFocus = (event: FocusEvent) => {
        if (!(event.target instanceof Element)) return;
        const element = event.target.closest<HTMLElement>('[data-motion]');
        if (!element) return;
        const tween = reveals.get(element);
        // Keyboard navigation never waits for a visual entrance.
        tween?.progress(1);
        tween?.scrollTrigger?.kill();
      };
      root.addEventListener('focusin', onFocus);
      return () => root.removeEventListener('focusin', onFocus);
    }, root);

    return () => {
      observer.disconnect();
      // Restore inline styles and dispose of owned tweens and ScrollTriggers.
      media.revert();
    };
  }, []);
  return <div ref={ref}>{children}</div>;
}
