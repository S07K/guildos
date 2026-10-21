import 'server-only';
import { studioSession } from './supabase';
import type { Project, Version, ChatUsage } from '@/components/studio/dashboard';

type View = 'overview' | 'projects' | 'analytics';
const pageSize = 500;
// Read only card fields from the latest version, never canvas nodes or full documents.
const previewColumns = 'studio_versions(kind:document->>kind,brand:document->>brand,headline:document->>headline,palette:document->>palette,cta:document->>cta)';

export async function dashboardData(view: View) {
 const { client, workspace } = await studioSession();
 const since = new Date();
 since.setUTCHours(0, 0, 0, 0);
 since.setUTCDate(since.getUTCDate() - 89);

 async function projects(): Promise<Project[]> {
  const rows: Project[] = [];
  for (let offset = 0; ; offset += pageSize) {
   let query = client.from('studio_projects')
    .select(view === 'analytics' ? 'id,name,created_at' : `id,name,brief,created_at,${previewColumns}`)
    .eq('workspace_id', workspace.id).order('created_at', { ascending: false }).order('id')
    .range(offset, offset + pageSize - 1);
   if (view !== 'analytics') query = query
    .order('created_at', { referencedTable: 'studio_versions', ascending: false })
    .order('id', { referencedTable: 'studio_versions', ascending: false })
    .limit(1, { referencedTable: 'studio_versions' });
   const { data, error } = await query;
   if (error) throw new Error('Your projects could not be loaded.');
   const page = (data || []) as unknown as (Project & { studio_versions?: NonNullable<Project['latest_design']>[] })[];
   rows.push(...page.map(({ studio_versions, ...project }) => ({ ...project, latest_design: studio_versions?.[0] || null })));
   if (page.length < pageSize) return rows;
  }
 }

 async function usage(table: 'studio_versions' | 'studio_agent_messages'): Promise<Version[]> {
  if (view === 'projects') return [];
  const rows: Version[] = [];
  for (let offset = 0; ; offset += pageSize) {
   let query = client.from(table).select('id,project_id,model,input_tokens,output_tokens,created_at')
    .eq('workspace_id', workspace.id).gte('created_at', since.toISOString())
    .order('created_at', { ascending: false }).order('id').range(offset, offset + pageSize - 1);
   if (table === 'studio_agent_messages') query = query.eq('author_kind', 'agent');
   const { data, error } = await query;
   if (error) throw new Error('Your workspace usage could not be loaded.');
   rows.push(...(data || []) as Version[]);
   if (!data || data.length < pageSize) return rows;
  }
 }
 const [projectRows, versions, messages] = await Promise.all([projects(), usage('studio_versions'), usage('studio_agent_messages')]);
 return { projects: projectRows, versions, messages: messages as ChatUsage[] };
}
