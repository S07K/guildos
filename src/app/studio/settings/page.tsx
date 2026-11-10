import { adminClient, studioSession } from '@/lib/studio/supabase';
import { Connections } from '@/components/studio/connections';
import { StudioPageHeader } from '@/components/studio/page-header';
export default async function Settings() {
 const { workspace } = await studioSession();
 const admin=adminClient();
 const [{data:key,error},{data:routerKey,error:routerError},{data:groqKey,error:groqError},{data:claudeKey,error:claudeError}]=await Promise.all([
  admin.from('studio_keys').select('suffix, updated_at').eq('workspace_id',workspace.id).maybeSingle(),
  admin.from('studio_openrouter_keys').select('suffix').eq('workspace_id',workspace.id).maybeSingle(),
  admin.from('studio_groq_keys').select('suffix').eq('workspace_id',workspace.id).maybeSingle(),
  admin.from('studio_anthropic_keys').select('suffix').eq('workspace_id',workspace.id).maybeSingle(),
 ]);
 if (error) throw new Error('Your settings could not be loaded.');
 if(routerError && routerError.code!=='PGRST205') throw new Error('OpenRouter settings could not be loaded.');
 if(groqError && groqError.code!=='PGRST205') throw new Error('Groq settings could not be loaded.');
 if(claudeError && claudeError.code!=='PGRST205') throw new Error('Claude settings could not be loaded.');
 return <><StudioPageHeader title="Connections" description="Manage the model providers and credentials used by your workspace." trail="Connections"/><Connections suffix={key?.suffix || null} openRouterSuffix={routerKey?.suffix||null} groqSuffix={groqKey?.suffix||null} claudeSuffix={claudeKey?.suffix||null}/><div className="studio-notice"><strong>Workspace data and usage</strong><p className="studio-hint">Your brief, selected design, and feedback are sent to the provider used for each request. Provider billing applies. One active generation and up to 30 attempts per day are supported.</p></div></>;
}
