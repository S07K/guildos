import { authConfig, sessionClient, studioUser } from '@/lib/studio/supabase';
import { fieldNotes } from '@/lib/marketing/field-notes';
import { ScrollMotion } from '@/components/scroll-motion';
import { ProcessArt } from '@/components/process-art';
import { LandscapeImage } from '@/components/landscape-image';
import { AgentMark } from '@/components/studio/agent-identity';
import { AiProviderMark } from '@/components/ai-provider-mark';
import { ProductPreview } from '@/components/product-preview';
import { CreativeWorkflow } from '@/components/creative-workflow';
import type { AgentRole } from '@/lib/studio/agent-roles';
import { Check, Sparkles } from 'lucide-react';
import { siteUrl } from '@/lib/site';

function Mark() {
  return <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#315b46"/><g fill="#f4f8f4"><rect x="6" y="6" width="8" height="8" rx="2"/><rect x="18" y="6" width="8" height="10" rx="2"/><rect x="6" y="18" width="10" height="8" rx="2"/></g><rect x="20" y="20" width="6" height="6" rx="2" fill="#a8c981"/></svg>;
}

const specialists: { name: string; role: AgentRole }[] = [
  { name: 'Creative direction', role: 'creative_director' },
  { name: 'UX architecture', role: 'ux_architect' },
  { name: 'UI design', role: 'ui_designer' },
  { name: 'Copywriting', role: 'copywriter' },
  { name: 'Quality & accessibility', role: 'qa_critic' },
];
const steps = [
  { number: '01', art: 'brief' as const, title: 'Give a brand a clearer voice.', description: 'Bring your audience, references, and rough direction. Shape a visual system and messaging that feel like they belong together.', tag: 'Brand direction · identity · voice' },
  { number: '02', art: 'create' as const, title: 'Turn a product idea into a flow.', description: 'Explore the structure, key screens, and language for an experience before getting into the small details.', tag: 'UX flow · screens · copy' },
  { number: '03', art: 'refine' as const, title: 'Make a draft ready to share.', description: 'Review the design on the canvas, ask for a revision, and keep the decisions that make the work yours.', tag: 'Editable drafts · clear review' },
];

export default async function Home() {
  const user = authConfig() ? (await studioUser(await sessionClient())).data.user : null;
  const studioHref = user ? '/studio' : '/signin';
  const profileName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'GuildOS member';
  const profilePhoto = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const avatarUrl = typeof profilePhoto === 'string' && /^https:\/\//.test(profilePhoto) ? profilePhoto : undefined;
  const initial = typeof profileName === 'string' ? profileName.trim().charAt(0).toUpperCase() || 'G' : 'G';
  return <div className="site-shell">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'GuildOS', url: siteUrl, applicationCategory: 'DesignApplication', operatingSystem: 'Web', description: 'A shared creative studio where specialized AI agents collaborate around your brief while you direct and review the work.', offers: { '@type': 'Offer', category: 'Early access', price: '0', priceCurrency: 'USD' }, publisher: { '@type': 'Organization', name: 'GuildOS', url: siteUrl },
    }) }} />
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <a href="/" className="brand" aria-label="GuildOS home"><Mark /><span>guild<span className="brand-os">os</span></span></a>
      <nav aria-label="Main navigation"><a href="#product-preview" className="process-link">The studio</a><a href="#how-it-works" className="process-link">How it works</a><a href="#blogs" className="process-link">Blogs</a>{user ? <a href="/studio" className="landing-avatar" aria-label="Open your studio">{avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : initial}</a> : <a href="/signin" className="nav-cta">Sign in</a>}</nav>

    </header>
    <main id="main"><ScrollMotion>
      <section className="hero" aria-labelledby="hero-title">
        <LandscapeImage scene="horizon" className="hero-landscape hero-landscape-monochrome" priority />
        <LandscapeImage scene="horizon" className="hero-landscape hero-landscape-color" />
        <div className="hero-fluid" aria-hidden="true"><div className="hero-fluid-wash hero-fluid-wash-one"/><div className="hero-fluid-wash hero-fluid-wash-two"/><div className="hero-fluid-ripple hero-fluid-ripple-one"/><div className="hero-fluid-ripple hero-fluid-ripple-two"/></div>
        <p className="eyebrow hero-eyebrow" data-motion="hero"><span aria-hidden="true" /> YOUR CREATIVE STUDIO, WITH A GUILD BUILT IN</p>
        <h1 id="hero-title" data-motion="hero" data-delay="100">Big ideas deserve<br /><span>a team behind them.</span></h1>
        <p className="hero-description" data-motion="hero" data-delay="220">One shared workspace for your brief, a guild of creative specialists, and the work you shape together.</p>
        <a href={studioHref} className="closing-button hero-signin">Enter the studio</a>

        <p className="hero-note">A creative studio for founders and small teams. You set the direction; your guild helps move the work forward.</p>
        <a className="hero-explore" href="#product-preview">Explore the studio</a>
      </section>

      <ProductPreview />

      <CreativeWorkflow />

      <section id="how-it-works" className="workflow-section" aria-labelledby="workflow-heading">
        <div className="section-intro" data-motion="rise"><div><p className="eyebrow">01 / A studio for the work ahead</p><h2 id="workflow-heading">Start with the idea.<br /><span>Find the shape together.</span></h2></div><p>Bring the half-formed thought, the new launch, or the experience you want to make clearer. Your guild helps turn it into a draft you can direct.</p></div>
        <div className="workflow-panel">
          <div className="panel-top"><span className="workspace-label">A few ways to get started</span><span className="concept">Made for creative work, shaped by you</span></div>
          <div className="workflow-steps" data-stagger>{steps.map((step) => <article className="workflow-step" key={step.number} data-stagger-item><span className="step-number">{step.number}</span><ProcessArt kind={step.art} /><h3>{step.title}</h3><p>{step.description}</p><span className="step-tag">{step.tag}</span></article>)}</div>
          <div className="specialist-row"><span className="specialist-label">Your specialists</span><ul>{specialists.map(({ name, role }) => <li key={role}><span className="specialist-avatar" aria-hidden="true"><AgentMark role={role} size={27}/></span><span>{name}</span></li>)}</ul></div>
        </div>
      </section>

      <section className="connector-section" aria-labelledby="connectors-heading">
        <div className="connector-intro"><p className="eyebrow">THE MODELS YOU ALREADY USE</p><h2 id="connectors-heading">Bring your preferred AI connection.</h2><p>Connect a supported provider to your workspace. GuildOS routes creative tasks through your connected models, while your team guides the work.</p></div>
        <div className="connector-providers"><p className="connector-title">AVAILABLE CONNECTORS</p><ul className="connector-list" data-stagger>
          <li data-stagger-item><AiProviderMark id="openai" size={22}/><span>OpenAI</span><span className="connector-state">Connect in studio</span></li>
          <li data-stagger-item><AiProviderMark id="claude" size={22}/><span>Claude</span><span className="connector-state">Connect in studio</span></li>
          <li data-stagger-item><AiProviderMark id="grok" size={22}/><span>Grok</span><span className="connector-state">Connect in studio</span></li>
        </ul><a className="connector-link" href="#product-preview">See the workspace</a></div>
      </section>

      <section className="studio-details" aria-labelledby="details-title">
        <div className="section-intro" data-motion="rise"><div><p className="eyebrow">BUILT AROUND THE WAY DESIGN HAPPENS</p><h2 id="details-title">A shared brief.<br/><span>A clearer way forward.</span></h2></div><p>Your project stays together as your idea develops, so the guild can build on the context you have already shared.</p></div>
        <div className="details-grid" data-stagger>
          <article className="detail-card detail-context" data-stagger-item>
            <div className="detail-illustration detail-brief-illustration" aria-hidden="true"><span className="detail-mini-label">PROJECT BRIEF</span><span className="detail-brief-line long"/><span className="detail-brief-line medium"/><span className="detail-brief-line short"/><span className="detail-brief-note"><Sparkles size={12}/> Brand tone: warm, clear, considered</span><span className="detail-float-tag">Shared with your guild <Check size={11}/></span></div>
            <p className="detail-overline">ONE SHARED STARTING POINT</p><h3>Your brief travels with the work.</h3><p>Keep the project goal, audience, feedback, and decisions in one place. Give every specialist the same context before they begin.</p>
          </article>
          <article className="detail-card detail-canvas" data-stagger-item>
            <div className="detail-illustration detail-canvas-illustration" aria-hidden="true"><div className="detail-canvas-toolbar"><span/><span/><span/><i>Northstar / Landing page</i></div><div className="detail-canvas-board"><div className="detail-canvas-copy"><b>MAKE ROOM<br/>FOR WHAT'S NEXT.</b><span/><span/><i>Explore the idea</i></div><div className="detail-canvas-shape"/></div></div>
            <p className="detail-overline">A DRAFT YOU CAN DIRECT</p><h3>Work takes shape on your canvas.</h3><p>Review the visual draft alongside its structure. Leave feedback, refine a detail, and keep a clear trail of revisions.</p>
          </article>
          <article className="detail-card detail-qa" data-stagger-item>
            <div className="detail-illustration detail-qa-illustration" aria-hidden="true"><div className="detail-qa-header"><span>QUALITY REVIEW</span><span className="detail-qa-score">04 checks</span></div>{['Contrast and readability','Layout consistency','Copy and hierarchy','Ready for your review'].map((item,index)=><div className="detail-check-row" key={item}><span><Check size={11}/></span>{item}<small>{index===3?'READY':'PASSED'}</small></div>)}<span className="detail-qa-progress"><i data-progress/></span></div>
            <p className="detail-overline">CHECKED BEFORE IT COMES BACK</p><h3>Make the details feel considered.</h3><p>A quality pass checks contrast, consistency, and completion before the work reaches your review queue.</p>
          </article>
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
          <a href={studioHref} className="quiet-link">Find your creative space</a>
        </div>
      </section>

      <section className="principles" aria-label="Designed for the way you work">
        <article data-motion="rise"><span className="principle-index">01 / CONTEXT</span><h3>Your brand, understood.</h3><p>A shared understanding of your brand and feedback keeps the whole team on the same page.</p></article>
        <article data-motion="rise" data-delay="120"><span className="principle-index">02 / COLLABORATION</span><h3>Less back and forth.</h3><p>Design, experience, and words come together in one place, with a clear direction from you.</p></article>
        <article data-motion="rise" data-delay="240"><span className="principle-index">03 / INTENTION</span><h3>More room for the good work.</h3><p>Let agents handle repetitive tasks while you focus on the decisions that make the work yours.</p></article>
      </section>
      <section className="use-cases" aria-labelledby="use-cases-heading">
        <div className="use-cases-heading" data-motion="rise"><p className="eyebrow">FROM FIRST THOUGHT TO FIRST DRAFT</p><h2 id="use-cases-heading">A little help for<br/><span>the work that matters.</span></h2><p>Whether you’re shaping a new product or giving an existing idea a clearer story, GuildOS brings the pieces of the creative process together.</p></div>
        <div className="use-case-list">
          <article className="use-case" data-scroll-drift><span>01</span><div><p className="eyebrow">FOR FOUNDERS</p><h3>Make the idea easier to understand.</h3><p>Turn an early product idea into a landing page direction. Start with who it serves and why it matters, then explore a clear story, visual language, and first draft together.</p></div><span className="use-case-outcome">POSITIONING / LANDING PAGES / BRAND</span></article>
          <article className="use-case" data-scroll-drift><span>02</span><div><p className="eyebrow">FOR PRODUCT TEAMS</p><h3>Find the shape of an experience.</h3><p>Map a user journey, explore screen layouts, and develop interface copy around a shared brief. Review the draft on the canvas and guide the next iteration with specific feedback.</p></div><span className="use-case-outcome">USER FLOWS / UI DESIGN / COPY</span></article>
          <article className="use-case" data-scroll-drift><span>03</span><div><p className="eyebrow">FOR CREATIVE TEAMS</p><h3>Make more room for the thinking.</h3><p>Use AI specialists to move through repetitive first passes while you focus on creative judgment. Keep your project context and revisions together as the work evolves.</p></div><span className="use-case-outcome">CONCEPTS / ITERATION / REVIEW</span></article>
        </div>
      </section>
      <section className="perspective-section" aria-labelledby="perspective-heading"><div className="perspective-orbit" aria-hidden="true" data-scroll-orbit><span><Mark /></span></div><div data-motion="rise"><p className="eyebrow">A MORE THOUGHTFUL CREATIVE PROCESS</p><h2 id="perspective-heading">AI can make the draft.<br/><em>You make it meaningful.</em></h2><p>Great design starts with understanding people. GuildOS gives your ideas a team to work with, while you decide what fits your audience, your brand, and your goals.</p><a href="#blogs">Explore the blogs</a></div></section>

      <section className="field-notes" id="blogs" aria-labelledby="field-notes-heading">
        <div className="field-notes-intro" data-motion="rise"><div><p className="eyebrow">THE GUILDOS BLOG</p><h2 id="field-notes-heading">Better ideas start<br/><span>with better questions.</span></h2></div><p>Practical notes for founders and creative teams building with AI, from the first brief to a more thoughtful review.</p></div>
        <div className="field-notes-list">{fieldNotes.map(note => <a key={note.slug} href={`/blogs/${note.slug}`} className="field-note-link"><div><p className="field-note-tag">{note.category}</p><h3>{note.title}</h3><p>{note.description}</p></div></a>)}</div>
      </section>

      <section className="faq-section" aria-labelledby="faq-heading">
        <div className="faq-intro"><p className="eyebrow">A FEW THINGS TO KNOW</p><h2 id="faq-heading">Good questions,<br/><span>clear answers.</span></h2><p>GuildOS is being built for people who want more creative momentum without giving up their say in the work.</p></div>
        <div className="faq-list">
          <details><summary>What can I make with GuildOS?</summary><p>Use a project to explore brand direction, shape a user experience, and develop visual and written drafts on a shared canvas.</p></details>
          <details><summary>How do the creative specialists work together?</summary><p>Each specialist takes a defined turn, from creative direction and UX structure through design, copy, and a quality review. They all use the context attached to the project.</p></details>
          <details><summary>Do I stay in control of the work?</summary><p>Yes. The guild prepares and refines drafts; you set the direction, review suggestions, and decide what to keep moving forward.</p></details>
          <details><summary>How can AI help with a design workflow?</summary><p>AI can help explore creative directions, organize a user experience, draft interface copy, and prepare visual concepts. Your brief and feedback guide the work, and you decide what to refine or keep.</p></details>
          <details><summary>What should I include in a design brief?</summary><p>Start with your goal, audience, and the problem you want to solve. Add relevant brand context, references, constraints, and the deliverable you want to explore first.</p></details>
          <details><summary>Can I revise a design after the first draft?</summary><p>Yes. Review the work on the canvas, describe what you want to change, and continue refining the direction with your guild.</p></details>
          <details><summary>Which AI connections can I use?</summary><p>GuildOS is designed to work with OpenAI, Claude, and Grok. You can review and manage your AI connections in your workspace.</p></details>
        </div>
      </section>
      <section className="closing-cta" aria-labelledby="closing-title">
        <div className="closing-scenery" aria-hidden="true"><LandscapeImage scene="sailboat" className="closing-landscape" /></div>
        <div className="closing-copy" data-motion="rise"><p className="eyebrow">A little less busy. A lot more possibility.</p><h2 id="closing-title">Your next chapter.<br /><span>A clearer horizon.</span></h2><p>Bring your next idea. We’ll bring the guild.</p><a href={studioHref} className="closing-button">Enter the studio</a></div>
      </section>
    </ScrollMotion></main>
    <footer><div className="footer-left"><a href="/" className="footer-brand" aria-label="GuildOS home"><Mark/><span>guildos</span></a><nav className="footer-socials" aria-label="GuildOS social links"><a href="https://x.com/guildosdesign" target="_blank" rel="noreferrer">X</a><a href="https://www.linkedin.com/company/guildosdesign/" target="_blank" rel="noreferrer">LinkedIn</a></nav></div><span>Thoughtfully built. Human-led.</span><span>© {new Date().getFullYear()} GuildOS</span></footer>
  </div>;
}
