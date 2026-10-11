import { WaitlistForm } from '@/components/waitlist-form';
import { ScrollMotion } from '@/components/scroll-motion';
import { ProcessArt } from '@/components/process-art';
import { LandscapeImage } from '@/components/landscape-image';

function Mark() {
  return <svg viewBox="0 0 28 28" width="25" height="25" fill="none" aria-hidden="true"><rect x="3" y="3" width="15" height="15" rx="5" stroke="currentColor" strokeWidth="1.5" /><rect x="10" y="10" width="15" height="15" rx="5" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

const specialists = ['Creative direction', 'UX architecture', 'UI design', 'Copywriting', 'Quality & accessibility'];
const steps = [
  { number: '01', art: 'brief' as const, title: 'Start with your vision.', description: 'Share your brief, your brand, and what you want to achieve. Every agent starts with the same context.', tag: 'A shared starting point' },
  { number: '02', art: 'create' as const, title: 'Let your guild create.', description: 'Specialists work together across design, experience, and copy, with room for your feedback at every step.', tag: 'Different skills. One direction.' },
  { number: '03', art: 'refine' as const, title: 'Make the final call.', description: 'Review the work, refine the details, and decide what moves forward. You stay in creative control.', tag: 'Always human-led' },
];

export default function Home() {
  return <div className="site-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <a href="/" className="brand" aria-label="GuildOS home"><Mark /><span>guild<span className="brand-os">os</span></span></a>
      <nav aria-label="Main navigation"><a href="#how-it-works" className="process-link">How it works</a><a href="#join" className="nav-cta">Get early access</a></nav>
    </header>
    <main id="main"><ScrollMotion>
      <section className="hero" aria-labelledby="hero-title">
        <LandscapeImage scene="horizon" className="hero-landscape" priority />
        <p className="eyebrow hero-eyebrow" data-motion="hero"><span aria-hidden="true" /> Your AI design agency · Early access</p>
        <h1 id="hero-title" data-motion="hero" data-delay="100">Your next big idea.<br /><span>A whole guild behind it.</span></h1>
        <p className="hero-description" data-motion="hero" data-delay="220">From your first brief to thoughtful design and copy.<br className="desktop-break" /> A guild of AI specialists, with you in creative control.</p>
        <WaitlistForm />
        <p className="hero-note">For founders, small teams, and the ideas that won’t leave you alone.</p>
        <a className="hero-explore" href="#how-it-works"><span>From pixels to possibilities.<small>Explore the process</small></span></a>
      </section>

      <section id="how-it-works" className="workflow-section" aria-labelledby="workflow-heading">
        <div className="section-intro" data-motion="rise"><div><p className="eyebrow">01 / A shared creative process</p><h2 id="workflow-heading">One brief. Many minds.<br /><span>Always your call.</span></h2></div><p>Creative direction, design, and words, working together. A little less coordinating. A lot more creating.</p></div>
        <div className="workflow-panel">
          <div className="panel-top"><span className="workspace-label">From the first thought to the final detail</span><span className="concept">The GuildOS vision</span></div>
          <div className="workflow-steps">{steps.map((step, index) => <article className="workflow-step" key={step.number} data-motion="rise" data-delay={index * 120}><span className="step-number">{step.number}</span><ProcessArt kind={step.art} /><h3>{step.title}</h3><p>{step.description}</p><span className="step-tag">{step.tag}</span></article>)}</div>
          <div className="specialist-row"><span className="specialist-label">Your specialists</span><ul>{specialists.map(name => <li key={name}>{name}</li>)}</ul></div>
        </div>
      </section>

      <section className="calm-section" aria-labelledby="calm-heading">
        <figure className="coast-figure" data-motion="coast">
          <LandscapeImage scene="headland" />
          <figcaption>A little perspective. A world of possibility.</figcaption>
        </figure>
        <div className="calm-copy" data-motion="rise" data-delay="160">
          <p className="eyebrow">02 / A little room to breathe</p>
          <h2 id="calm-heading">Less busywork.<br /><span>More blue sky.</span></h2>
          <p>Great work starts with space to think. Let your guild take on the repetitive parts, so you can follow the ideas that feel like you.</p>
          <p>Set the direction. Explore the possibilities. Make the final call, in your own time.</p>
          <a href="#join" className="quiet-link">Find your creative space</a>
        </div>
      </section>

      <section className="principles" aria-label="Designed for the way you work">
        <article data-motion="rise"><span className="principle-index">01 / CONTEXT</span><h3>Your brand, understood.</h3><p>A shared understanding of your brand and feedback keeps the whole team on the same page.</p></article>
        <article data-motion="rise" data-delay="120"><span className="principle-index">02 / COLLABORATION</span><h3>Less back and forth.</h3><p>Design, experience, and words come together in one place, with a clear direction from you.</p></article>
        <article data-motion="rise" data-delay="240"><span className="principle-index">03 / INTENTION</span><h3>More room for the good work.</h3><p>Let agents handle repetitive tasks while you focus on the decisions that make the work yours.</p></article>
      </section>
      <section className="closing-cta" aria-labelledby="closing-title">
        <div className="closing-scenery" aria-hidden="true"><LandscapeImage scene="sailboat" className="closing-landscape" /></div>
        <div className="closing-copy" data-motion="rise"><p className="eyebrow">A little less busy. A lot more possibility.</p><h2 id="closing-title">Your next chapter.<br /><span>A clearer horizon.</span></h2><p>Bring your next idea. We’ll bring the guild.</p><a href="#join" className="closing-button">Join the waitlist</a></div>
      </section>
    </ScrollMotion></main>
    <footer><a href="/" className="footer-brand">guildos</a><span>Thoughtfully built. Human-led.</span><span>© {new Date().getFullYear()} GuildOS</span></footer>
  </div>;
}
