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
      const revealMedia = gsap.matchMedia();
      revealMedia.add('(hover: hover) and (pointer: fine)', () => {
        const hero = root.querySelector<HTMLElement>('.hero');
        const color = hero?.querySelector<HTMLElement>('.hero-landscape-color');
        if (!hero || !color) return;
        type Point = { x: number; y: number; time: number };
        const points: Point[] = [];
        let frame = 0;
        let lastPoint = 0;
        const draw = (now: number) => {
          while (points.length && now - points[0].time > 2400) points.shift();
          const rect = color.getBoundingClientRect();
          const masks = points.map(point => {
            const age = (now - point.time) / 2400;
            const radius = 105 * (1 - age * .55);
            const strength = Math.max(0, 1 - age);
            return `radial-gradient(circle ${radius}px at ${point.x - rect.left}px ${point.y - rect.top}px, rgba(0,0,0,${strength}) 0%, rgba(0,0,0,${strength * .7}) 45%, transparent 100%)`;
          });
          color.style.maskImage = masks.length ? masks.join(',') : 'linear-gradient(transparent, transparent)';
          color.style.webkitMaskImage = color.style.maskImage;
          if (points.length) frame = requestAnimationFrame(draw);
          else frame = 0;
        };
        const move = (event: PointerEvent) => {
          if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
          const now = performance.now();
          if (now - lastPoint < 38) return;
          lastPoint = now;
          points.push({ x: event.clientX, y: event.clientY, time: now });
          if (points.length > 16) points.shift();
          if (!frame) frame = requestAnimationFrame(draw);
        };
        hero.addEventListener('pointermove', move);
        return () => {
          hero.removeEventListener('pointermove', move);
          cancelAnimationFrame(frame);
          color.style.removeProperty('mask-image');
          color.style.removeProperty('-webkit-mask-image');
        };
      });

      const fluid = root.querySelector<HTMLElement>('.hero-fluid');
      if (fluid) {
        const washOne = fluid.querySelector('.hero-fluid-wash-one');
        const washTwo = fluid.querySelector('.hero-fluid-wash-two');
        const ripples = fluid.querySelectorAll('.hero-fluid-ripple');
        const motion = gsap.timeline({ paused: true });
        motion.to(washOne, { xPercent: 10, yPercent: -8, scale: 1.12, duration: 12, ease: 'sine.inOut', repeat: -1, yoyo: true }, 0)
          .to(washTwo, { xPercent: -12, yPercent: 6, scale: 1.1, duration: 15, ease: 'sine.inOut', repeat: -1, yoyo: true }, 0)
          .to(ripples, { xPercent: 8, scaleX: 1.12, opacity: .65, duration: 8, ease: 'sine.inOut', stagger: 2, repeat: -1, yoyo: true }, 0);
        ScrollTrigger.create({ trigger: fluid.parentElement, start: 'top bottom', end: 'bottom top', onToggle: self => self.isActive ? motion.play() : motion.pause() });
      }

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

      root.querySelectorAll<HTMLElement>('[data-scroll-drift]').forEach(element => {
        gsap.fromTo(element, { x: -14 }, {
          x: 14, ease: 'none',
          scrollTrigger: { trigger: element, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });
      root.querySelectorAll<HTMLElement>('[data-scroll-orbit]').forEach(element => {
        gsap.fromTo(element, { rotation: -18, y: 20 }, {
          rotation: 18, y: -20, ease: 'none',
          scrollTrigger: { trigger: element.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
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
      return () => { root.removeEventListener('focusin', onFocus); revealMedia.revert(); };
    }, root);

    return () => {
      observer.disconnect();
      // Restore inline styles and dispose of owned tweens and ScrollTriggers.
      media.revert();
    };
  }, []);
  return <div ref={ref}>{children}</div>;
}
