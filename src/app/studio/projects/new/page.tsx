import { trackEvent } from '@/lib/analytics';
import { ProjectForm } from '@/components/studio/forms';
import Link from 'next/link';
import { StudioPageHeader } from '@/components/studio/page-header';
import { GuildLineup } from '@/components/studio/agent-identity';
export default async function NewProject({ searchParams }: { searchParams: Promise<{ brief?: string | string[] }> }) {
 const raw = (await searchParams).brief;
 const brief = typeof raw === 'string' ? raw.slice(0, 2000) : '';
 if (brief) await trackEvent('landing_brief_opened');
 return <><StudioPageHeader title="Start a project" description="Give a specialist guild your direction. They will build, review, and leave their decisions on the canvas for you." trail="Projects / New project"/>
  <section className="guild-onboarding-intro" aria-labelledby="guild-intro-title"><div className="guild-onboarding-heading"><div><span className="guild-step-label">01 / MEET YOUR GUILD</span><h2 id="guild-intro-title">Five specialists.<br/><em>One shared direction.</em></h2></div><p>The Creative Director sets the vision. UX and copy shape the experience together. The UI Designer builds the draft, then QA reviews it. You can comment, mention a specialist, and steer the next round.</p></div><GuildLineup/></section>
  <div className="new-project-grid"><section className="studio-panel guild-brief-panel"><span className="guild-step-label">02 / SET THE DIRECTION</span><h2>Give the guild a brief</h2><p className="studio-hint">Describe your audience, goals, and visual direction. Your brief gives every specialist shared context for the work ahead.</p><ProjectForm defaultBrief={brief} /></section><aside className="brief-guide guild-next-steps"><span className="guild-step-label">03 / MAKE IT YOURS</span><h2>From brief to canvas</h2><ol><li><strong>Brief your guild</strong><p>Create your project, then tell the guild what to build in the project conversation.</p></li><li><strong>Follow the work</strong><p>Your specialists plan, design, and review changes together. Track their progress in Tasks.</p></li><li><strong>Review and refine</strong><p>Review the draft on your canvas. Request changes, mention a specialist, and approve work when it is ready.</p></li></ol><p>You set the direction; your guild handles the design work. Every draft, decision, and comment stays with your project.</p><Link href="/studio/projects">Back to projects</Link></aside></div></>;
}
