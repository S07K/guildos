import { adminClient, studioSession } from '@/lib/studio/supabase';
import { Connections } from '@/components/studio/connections';
import { StudioPageHeader } from '@/components/studio/page-header';
export default async function Settings() {
 const { workspace } = await studioSession();
 const { data: key, error } = await adminClient().from('studio_keys').select('suffix, updated_at').eq('workspace_id', workspace.id).maybeSingle();
 if (error) throw new Error('Your settings could not be loaded.');
 return <><StudioPageHeader title="Connections" description="Manage the model providers and credentials used by your workspace." trail="Connections"/><Connections suffix={key?.suffix || null} /><div className="studio-notice"><strong>Workspace data and usage</strong><p className="studio-hint">Your brief, selected design, and feedback are sent to OpenAI when you generate. API usage is billed by OpenAI. One active generation and up to 30 attempts per day are supported.</p></div></>;
}
