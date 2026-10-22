'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Circle, MessageSquareText } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { AgentMark } from '@/components/studio/agent-identity';
import { agentIdentity, agentRoles, type AgentRole } from '@/lib/studio/agent-roles';

const descriptions: Record<AgentRole, { title: string; description: string }> = {
  creative_director: { title: 'Find the direction', description: 'Ari pulls the goal, audience, and brand signals into a clear creative north star.' },
  ux_architect: { title: 'Shape the experience', description: 'Noor maps the page structure and the path someone should take through it.' },
  ui_designer: { title: 'Build the visual draft', description: 'Mira turns that direction into an editable design on your project canvas.' },
  copywriter: { title: 'Give it the right words', description: 'Pip gives each section a voice that fits the brief and the experience.' },
  qa_critic: { title: 'Check before review', description: 'Vale checks consistency, contrast, and completeness before the draft comes back to you.' },
};

export function CreativeWorkflow() {
  const [activeRole, setActiveRole] = useState<AgentRole>(agentRoles[0]);
  const root = useRef<HTMLElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const current = descriptions[activeRole];
  const activeIndex = agentRoles.indexOf(activeRole);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setActiveRole(role => agentRoles[(agentRoles.indexOf(role) + 1) % agentRoles.length]);
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const ctx = gsap.context(() => {
        const path = section.querySelector<SVGPathElement>('.journey-path');
        if (path) {
          const length = path.getTotalLength();
          gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
          gsap.to(path, { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut', scrollTrigger: { trigger: section, start: 'top 75%', once: true } });
        }
        gsap.fromTo('.journey-step', { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .65, stagger: .12, ease: 'power3.out', scrollTrigger: { trigger: section, start: 'top 74%', once: true } });
        gsap.fromTo('.journey-prompt', { x: -16, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .7, delay: .25, ease: 'power3.out', scrollTrigger: { trigger: section, start: 'top 74%', once: true } });
      }, section);
      return () => ctx.revert();
    });
    return () => media.revert();
  }, []);

  useEffect(() => {
    const element = detail.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tween = gsap.fromTo(element, { autoAlpha: .45, y: 8 }, { autoAlpha: 1, y: 0, duration: .32, ease: 'power2.out' });
    return () => { tween.kill(); };
  }, [activeRole]);

  return <section ref={root} className="creative-journey" aria-labelledby="journey-title">
    <div className="journey-copy">
      <p className="eyebrow">A WORKFLOW THAT WORKS TOGETHER</p>
      <h2 id="journey-title">From your first thought<br/><span>to a draft you can shape.</span></h2>
      <p>One project brief gives the whole guild a shared starting point. Each specialist adds their part in order, then the work comes back to you for a decision.</p>
      <div className="journey-detail" ref={detail} aria-live="polite" aria-atomic="true">
        <div className="journey-detail-agent"><AgentMark role={activeRole} size={38}/><span><small>YOUR {agentIdentity[activeRole].short.toUpperCase()}</small><strong>{agentIdentity[activeRole].name}</strong></span></div>
        <p>{current.description}</p>
      </div>
      <a className="journey-link" href="#product-preview">Explore the studio <ArrowRight size={15}/></a>
    </div>
    <div className="journey-visual" data-active={activeRole} aria-label="Five-stage creative workflow">
      <div className="journey-board-top"><span><span className="journey-board-dot"/> NORTHSTAR LAUNCH / CREATIVE WORKFLOW</span><span>5 SPECIALISTS · 1 SHARED BRIEF</span></div>
      <div className="journey-steps" role="list">
        <svg className="journey-connector" viewBox="0 0 800 58" preserveAspectRatio="none" aria-hidden="true"><path className="journey-path" d="M20 34 C100 34 100 18 180 18 S260 42 340 42 S420 18 500 18 S580 42 660 42 S740 24 780 24" fill="none" stroke="#b7cabb" strokeWidth="2" strokeDasharray="5 7" strokeLinecap="round"/></svg>
        {agentRoles.map((role, index) => <div className={`journey-step${activeRole===role?' is-active':''}${index<=activeIndex?' is-complete':''}`} key={role} role="listitem" aria-current={activeRole===role?'step':undefined} aria-label={`Stage ${index+1}: ${agentIdentity[role].name}`}>
          <span className="journey-step-avatar"><AgentMark role={role} size={38}/><span className="journey-step-check" aria-hidden="true">{index<=activeIndex?<Check size={10}/>:<Circle size={9}/>}</span></span>
          <strong>{descriptions[role].title}</strong><small>{agentIdentity[role].name}</small>
        </div>)}
      </div>
      <div className="journey-prompt"><div className="journey-prompt-icon"><MessageSquareText size={16}/></div><div><span>YOUR BRIEF, SHARED BY THE WHOLE GUILD</span><p>“A warm, clear landing page for a small team launching a better way to plan.”</p></div></div>
      <div className="journey-review"><span className="journey-review-check"><Check size={13}/></span><span><strong>Then it comes back to you.</strong><small>Review the draft, leave feedback, and choose what happens next.</small></span><span className="journey-review-badge">YOUR CALL</span></div>
    </div>
  </section>;
}
